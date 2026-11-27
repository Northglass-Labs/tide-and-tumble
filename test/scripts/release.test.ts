import { describe, expect, it } from "vitest";
import { checkAddress, promote, rollback } from "../../scripts/lib/release.mjs";
import { StepFailed } from "../../scripts/lib/run.mjs";

const PROJECT = { worker: "tide-and-tumble", origin: "https://tideandtumble.app", configPath: "/repo/wrangler.jsonc" };
const CONFIG = `--config ${PROJECT.configPath}`;
// The Worker's own address, as the person releasing names it; `example` stands for the account's subdomain.
const WORKERS_DEV = "https://tide-and-tumble.example.workers.dev";
const SHA = "abc123def456";
const FULL_SHA = `${SHA}0123456789abcdef01234567`;
const OTHER_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const OLD = "11111111-1111-4111-8111-111111111111";
const OLDER = "22222222-2222-4222-8222-222222222222";
const NEW = "33333333-3333-4333-8333-333333333333";

interface Result {
  ok: boolean;
  stdout: string;
  output: string;
}

const ok = (stdout = ""): Result => ({ ok: true, stdout, output: stdout });
const failed = (output = "it broke"): Result => ({ ok: false, stdout: "", output });

function deployment(createdOn: string, versionId: string) {
  return { created_on: createdOn, versions: [{ version_id: versionId, percentage: 100 }] };
}

interface Scenario {
  dirty?: string;
  originMain?: string;
  /** Set when running on GitHub Actions: the ref and commit GitHub says this run is for. */
  github?: { ref: string; sha: string };
  install?: Result;
  build?: Result;
  /** What is in out/ after the build. */
  output?: { files: string[]; links: string[] };
  strayConfigs?: string[];
  /** The version the site's address says is answering; by default the live one. Null: it cannot say. */
  answering?: string | null;
  /** The version the workers.dev address says is answering; by default the live one. */
  devAnswering?: string | null;
  /** Versions `wrangler versions view` cannot find, as for a Worker in another account. */
  unknownVersions?: string[];
  /** The live version's id, "missing" for a Worker never deployed, or "split". */
  live?: string;
  /** Another release or rollback that makes `live` live just before the given `deployments status` call (1-based). */
  interference?: { atStatusCall: number; live: string };
  statusFailsAt?: number;
  deployTookEffect?: boolean;
  history?: ReturnType<typeof deployment>[];
  upload?: Result;
  deploy?: Result;
  rollback?: Result;
  unhealthy?: string[];
  unhealthyOnce?: string[];
  blocked?: string[];
  broken?: string[];
}

/** Stand-ins for git, npm, Wrangler and the health check that record what they are asked. */
function fakeTools(scenario: Scenario = {}) {
  const commands: string[] = [];
  const checks: { check: string; baseUrl: string; expectTag?: string | null; expectVersion?: string | null }[] = [];
  const asked: string[] = [];
  let live = scenario.live ?? OLD;
  let statusCalls = 0;

  const tools = {
    say: () => undefined,
    github: scenario.github ?? null,
    buildOutput: () => scenario.output ?? { files: ["index.html", ".assetsignore", "_headers"], links: [] },
    strayConfigs: () => scenario.strayConfigs ?? [],
    answeringVersion: (baseUrl: string) => {
      asked.push(baseUrl);
      const own = baseUrl === WORKERS_DEV ? scenario.devAnswering : scenario.answering;
      const versionId = own !== undefined ? own : live === "missing" ? null : live === "split" ? OLD : live;
      return Promise.resolve(
        versionId === null
          ? { versionId: null, detail: "/api/health answered 404 with no version" }
          : { versionId, detail: "/api/health answered 200" },
      );
    },
    run: (command: string, args: string[]): Result => {
      const line = `${command} ${args.join(" ")}`;
      commands.push(line);
      if (line === "git status --porcelain") return ok(scenario.dirty ?? "");
      if (line === "git rev-parse HEAD") return ok(`${FULL_SHA}\n`);
      if (line === "git fetch --quiet origin main") return ok();
      if (line === "git rev-parse origin/main") return ok(`${scenario.originMain ?? FULL_SHA}\n`);
      if (line === "git rev-parse --short=12 HEAD") return ok(`${SHA}\n`);
      if (line === "git log -1 --format=%s") return ok("feat: a change\n");
      if (line === "npm ci") return scenario.install ?? ok();
      if (line === "npm run build") return scenario.build ?? ok();
      throw new Error(`unexpected command: ${line}`);
    },
    wrangler: (args: string[]): Result => {
      const line = `wrangler ${args.join(" ")}`;
      commands.push(line);
      if (line.startsWith("wrangler deployments status")) {
        statusCalls += 1;
        if (scenario.interference?.atStatusCall === statusCalls) live = scenario.interference.live;
        if (scenario.statusFailsAt === statusCalls) return failed("✘ [ERROR] A request to the Cloudflare API failed.");
        if (live === "missing") return failed("This Worker does not exist on your account. [code: 10007]");
        const versions =
          live === "split"
            ? [
                { version_id: OLD, percentage: 50 },
                { version_id: OLDER, percentage: 50 },
              ]
            : [{ version_id: live, percentage: 100 }];
        return ok(JSON.stringify({ created_on: "2026-11-27T12:00:00Z", versions }));
      }
      if (line.startsWith("wrangler deployments list")) {
        return ok(
          JSON.stringify(
            scenario.history ?? [deployment("2026-11-27T11:00:00Z", OLDER), deployment("2026-11-27T12:00:00Z", OLD)],
          ),
        );
      }
      if (line.startsWith("wrangler versions view")) {
        return (scenario.unknownVersions ?? []).includes(args[2] ?? "")
          ? failed("✘ [ERROR] Version not found [code: 10007]")
          : ok(JSON.stringify({ id: args[2] }));
      }
      if (line.startsWith("wrangler versions upload")) {
        return scenario.upload ?? ok(`Worker Version ID: ${NEW}\n`);
      }
      if (line.startsWith("wrangler versions deploy")) {
        const result = scenario.deploy ?? ok();
        if (result.ok || scenario.deployTookEffect) live = NEW;
        return result;
      }
      if (line.startsWith("wrangler deploy")) {
        const result = scenario.deploy ?? ok();
        if (result.ok) live = NEW;
        return result;
      }
      if (line.startsWith("wrangler rollback")) {
        const result = scenario.rollback ?? ok();
        if (result.ok) live = args[1] ?? live;
        return result;
      }
      throw new Error(`unexpected command: ${line}`);
    },
    health: (check: string, options: { baseUrl: string; expectTag?: string | null; expectVersion?: string | null }) => {
      checks.push({ check, baseUrl: options.baseUrl, expectTag: options.expectTag, expectVersion: options.expectVersion });
      if ((scenario.broken ?? []).includes(check)) {
        return Promise.reject(new Error("fetch failed: getaddrinfo EAI_AGAIN"));
      }
      const blocked = (scenario.blocked ?? []).includes(check);
      const once = (scenario.unhealthyOnce ?? []).includes(check) && checks.filter((c) => c.check === check).length === 1;
      const healthy = !blocked && !once && !(scenario.unhealthy ?? []).includes(check);
      return Promise.resolve({
        ok: healthy,
        blocked,
        url: options.baseUrl,
        tag: blocked ? null : SHA,
        versionId: blocked ? null : NEW,
        samples: 20,
        p95Ms: healthy ? 40 : null,
        limitMs: 300,
        failures: healthy ? [] : ["/api/health answered 500, not 200"],
      });
    },
  };

  return { tools, commands, checks, asked, wranglerCommands: () => commands.filter((line) => line.startsWith("wrangler")) };
}

async function failure(attempt: Promise<unknown>): Promise<StepFailed> {
  try {
    await attempt;
  } catch (error) {
    if (error instanceof StepFailed) return error;
    throw error;
  }
  throw new Error("expected the command to fail");
}

describe("checkAddress()", () => {
  it("is the site's own address by default, and this Worker's workers.dev address when named", () => {
    expect(checkAddress(PROJECT, undefined)).toEqual({ url: PROJECT.origin, domain: true });
    expect(checkAddress(PROJECT, "https://tideandtumble.app/")).toEqual({ url: PROJECT.origin, domain: true });
    expect(checkAddress(PROJECT, WORKERS_DEV)).toEqual({ url: WORKERS_DEV, domain: false });
  });

  it("refuses any other address, so a check cannot be pointed somewhere that proves nothing", () => {
    for (const origin of ["https://other.example.workers.dev", "https://evil.example", "--help", `${WORKERS_DEV}/api`]) {
      expect(() => checkAddress(PROJECT, origin)).toThrow("--origin takes");
    }
  });
});

describe("promote", () => {
  it("builds, confirms production is this Worker, uploads, sends it traffic and checks production", async () => {
    const fake = fakeTools();

    const summary = await promote(PROJECT, fake.tools);

    expect(fake.commands).toEqual([
      "git status --porcelain",
      "git rev-parse HEAD",
      "git fetch --quiet origin main",
      "git rev-parse origin/main",
      "git rev-parse --short=12 HEAD",
      "git log -1 --format=%s",
      "npm ci",
      "npm run build",
      `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
      `wrangler versions upload --tag ${SHA} --message ${SHA} feat: a change ${CONFIG}`,
      // Read again just before the deploy: has another release changed production meanwhile?
      `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
      `wrangler versions deploy ${NEW}@100% --name tide-and-tumble --message ${SHA} feat: a change --yes ${CONFIG}`,
    ]);
    // The site answered with the live version before anything changed: the zone route is attached.
    expect(fake.asked).toEqual([PROJECT.origin]);
    // Version URLs are off: production is the new version's first check.
    expect(fake.checks).toEqual([{ check: "production", baseUrl: PROJECT.origin, expectTag: SHA, expectVersion: undefined }]);
    expect(summary).toEqual({ ok: true, tag: SHA, versionId: NEW, previousVersionId: OLD, url: PROJECT.origin, p95Ms: 40 });
  });

  it("gives every Wrangler call the committed wrangler.jsonc", async () => {
    const fake = fakeTools();
    await promote(PROJECT, fake.tools);
    for (const line of fake.wranglerCommands()) {
      expect(line.endsWith(CONFIG)).toBe(true);
    }
  });

  it("refuses to run while a stray Wrangler configuration could be read instead", async () => {
    for (const run of [
      (tools: ReturnType<typeof fakeTools>["tools"]) => promote(PROJECT, tools),
      (tools: ReturnType<typeof fakeTools>["tools"]) => rollback(PROJECT, undefined, tools),
    ]) {
      const fake = fakeTools({ strayConfigs: ["/home/wrangler.toml"] });
      const error = await failure(run(fake.tools));
      expect(error.message).toContain("wrangler.json or wrangler.toml");
      expect(fake.commands).toEqual([]);
    }
  });

  it("refuses an --origin that is neither the site nor this Worker's workers.dev address, before anything", async () => {
    const fake = fakeTools();
    await expect(promote(PROJECT, fake.tools, { origin: "https://elsewhere.example" })).rejects.toThrow("--origin takes");
    expect(fake.commands).toEqual([]);
  });

  it("changes nothing when the site's address is not served by the live version: the route is not attached", async () => {
    // Before the cutover, or after a hosting rollback, the previous host answers: a check there would fail a
    // healthy release and roll it back.
    for (const answering of [null, OLDER]) {
      const fake = fakeTools({ answering });

      const error = await failure(promote(PROJECT, fake.tools));

      expect(error.message).toContain("not served by this Worker's live version");
      expect(error.message).toContain("--origin https://tide-and-tumble.<account subdomain>.workers.dev");
      expect(fake.wranglerCommands()).toEqual([`wrangler deployments status --name tide-and-tumble --json ${CONFIG}`]);
    }
  });

  it("checks the Worker's workers.dev address instead when named, after confirming the account there", async () => {
    const fake = fakeTools();

    const summary = await promote(PROJECT, fake.tools, { origin: WORKERS_DEV });

    expect(fake.asked).toEqual([WORKERS_DEV]);
    expect(fake.wranglerCommands()).toContain(`wrangler versions view ${OLD} --name tide-and-tumble --json ${CONFIG}`);
    expect(fake.checks).toMatchObject([{ check: "production", baseUrl: WORKERS_DEV, expectTag: SHA }]);
    expect(summary.url).toBe(WORKERS_DEV);
  });

  it("changes nothing when workers.dev answers with a version Wrangler cannot find: another account", async () => {
    const fake = fakeTools({ unknownVersions: [OLD] });

    const error = await failure(promote(PROJECT, fake.tools, { origin: WORKERS_DEV }));

    expect(error.message).toContain(`cannot find version ${OLD}`);
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler versions upload"))).toBe(false);
  });

  it("goes on when workers.dev cannot say which version answers, so a fix stays releasable while it is down", async () => {
    const fake = fakeTools({ devAnswering: null });
    const summary = await promote(PROJECT, fake.tools, { origin: WORKERS_DEV });
    expect(summary).toMatchObject({ ok: true, versionId: NEW });
  });

  it("refuses a working tree with uncommitted changes, before doing anything", async () => {
    const fake = fakeTools({ dirty: " M src/worker/index.ts\n" });
    const error = await failure(promote(PROJECT, fake.tools));
    expect(error.message).toContain("commit or stash");
    expect(fake.commands).toEqual(["git status --porcelain"]);
  });

  it("releases only the commit main is on, on a workstation and on GitHub", async () => {
    const workstation = fakeTools({ originMain: OTHER_SHA });
    expect((await failure(promote(PROJECT, workstation.tools))).message).toContain("release only main");
    expect(workstation.commands).not.toContain("npm ci");

    const otherBranch = fakeTools({ github: { ref: "refs/heads/feature", sha: FULL_SHA } });
    expect((await failure(promote(PROJECT, otherBranch.tools))).message).toContain("release only main");

    const onMain = fakeTools({ github: { ref: "refs/heads/main", sha: FULL_SHA } });
    await promote(PROJECT, onMain.tools);
    // On GitHub the run's own commit is trusted; there is no credential to fetch with.
    expect(onMain.commands).not.toContain("git fetch --quiet origin main");
  });

  it("refuses a build holding a dotfile, a key or a symbolic link, before any Wrangler call", async () => {
    const fake = fakeTools({ output: { files: ["index.html", ".assetsignore", ".env", "deploy/id_ed25519"], links: ["hosts"] } });

    const error = await failure(promote(PROJECT, fake.tools));

    expect(error.message).toContain("must never be uploaded");
    expect(error.details).toBe("out/.env\nout/deploy/id_ed25519\nout/hosts");
    expect(fake.wranglerCommands()).toEqual([]);
  });

  it("stops before traffic moves when Wrangler names an address for the version: Version URLs are on", async () => {
    const fake = fakeTools({
      upload: ok(`Worker Version ID: ${NEW}\nVersion Preview URL: https://33333333-tide-and-tumble.example.workers.dev\n`),
    });

    const error = await failure(promote(PROJECT, fake.tools));

    expect(error.message).toContain("Version URLs are on");
    // The version's address carries the account's subdomain; it is not printed.
    expect(error.message).not.toContain("workers.dev");
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler versions deploy"))).toBe(false);
  });

  it("stops without changing production when another release changed it meanwhile", async () => {
    const fake = fakeTools({ interference: { atStatusCall: 2, live: OLDER } });
    const error = await failure(promote(PROJECT, fake.tools));
    expect(error.message).toContain("another release may be under way");
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler versions deploy"))).toBe(false);
  });

  it("checks production once more before rolling back, so one bad answer does not undo a healthy release", async () => {
    const fake = fakeTools({ unhealthyOnce: ["production"] });
    const summary = await promote(PROJECT, fake.tools);
    expect(summary.ok).toBe(true);
    expect(fake.checks.map((check) => check.check)).toEqual(["production", "production"]);
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler rollback"))).toBe(false);
  });

  it("rolls back to the version that was live when production fails twice, and checks the rollback", async () => {
    const fake = fakeTools({ unhealthy: ["production"] });

    const error = await failure(promote(PROJECT, fake.tools));

    expect(error.message).toBe(`Failed to pass the health check on production; rolled back to version ${OLD}.`);
    expect(fake.wranglerCommands()).toContain(
      `wrangler rollback ${OLD} --name tide-and-tumble --message Automatic rollback: ${SHA} failed its health check --yes ${CONFIG}`,
    );
    expect(fake.checks.at(-1)).toMatchObject({ check: "rollback", baseUrl: PROJECT.origin, expectVersion: OLD });
  });

  it("rolls nothing back when another release or rollback has changed production since", async () => {
    // Status calls: before, before the deploy, then the read before rolling back.
    const fake = fakeTools({ unhealthy: ["production"], interference: { atStatusCall: 3, live: OLDER } });
    const error = await failure(promote(PROJECT, fake.tools));
    expect(error.message).toContain("nothing was rolled back");
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler rollback"))).toBe(false);
  });

  it("never rolls back on a check bot protection blocked: it says the version may be live and unchecked", async () => {
    const fake = fakeTools({ blocked: ["production"] });
    const error = await failure(promote(PROJECT, fake.tools));
    expect(error.message).toContain(`version ${NEW} may be live and unchecked`);
    expect(error.message).toContain(`npm run rollback -- ${OLD}`);
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler rollback"))).toBe(false);
  });

  it("counts a check that breaks as a failed one, so it still rolls back", async () => {
    const fake = fakeTools({ broken: ["production"] });
    const error = await failure(promote(PROJECT, fake.tools));
    expect(error.message).toContain(`rolled back to version ${OLD}`);
  });

  it("asks what is live when Wrangler reports a failed deploy, and goes on if it took effect", async () => {
    const tookEffect = fakeTools({ deploy: failed("timed out"), deployTookEffect: true });
    expect((await promote(PROJECT, tookEffect.tools)).versionId).toBe(NEW);

    const didNot = fakeTools({ deploy: failed("timed out") });
    expect((await failure(promote(PROJECT, didNot.tools))).message).toContain(`production is still on ${OLD} (100%)`);
  });

  it("does not roll back a split deployment by itself", async () => {
    const fake = fakeTools({ live: "split", answering: null, unhealthy: ["production"] });
    // Split: the site cannot be confirmed as serving one live version, so name workers.dev.
    const error = await failure(promote(PROJECT, fake.tools, { origin: WORKERS_DEV }));
    expect(error.message).toContain("Traffic was split between versions");
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler rollback"))).toBe(false);
  });

  it("keeps account details out of what it prints, since the Actions logs are public", async () => {
    const fake = fakeTools({
      upload: failed(
        "✘ [ERROR] A request failed for accounts/0123456789abcdef0123456789abcdef (signed in as someone@example.com) " +
          "at https://tide-and-tumble.example.workers.dev",
      ),
    });

    const error = await failure(promote(PROJECT, fake.tools));

    expect(error.details).not.toMatch(/0123456789abcdef0123456789abcdef|someone@example\.com|\.example\.workers\.dev/);
    expect(error.details).toContain("[account id]");
    expect(error.details).toContain("tide-and-tumble.[subdomain].workers.dev");
  });

  describe("the first release, when the Worker does not exist yet", () => {
    it("must be checked at the Worker's workers.dev address, since the site is not yet served by it", async () => {
      const fake = fakeTools({ live: "missing" });
      const error = await failure(promote(PROJECT, fake.tools));
      expect(error.message).toContain("does not exist yet");
      expect(fake.wranglerCommands()).toEqual([`wrangler deployments status --name tide-and-tumble --json ${CONFIG}`]);
    });

    it("creates the Worker with one deploy and checks it at workers.dev", async () => {
      const fake = fakeTools({ live: "missing" });

      const summary = await promote(PROJECT, fake.tools, { origin: WORKERS_DEV });

      expect(fake.wranglerCommands()).toEqual([
        `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
        `wrangler deploy --tag ${SHA} --message ${SHA} feat: a change ${CONFIG}`,
      ]);
      expect(fake.checks).toMatchObject([{ check: "production", baseUrl: WORKERS_DEV, expectTag: SHA }]);
      expect(summary).toMatchObject({ ok: true, previousVersionId: null, url: WORKERS_DEV });
    });

    it("fails plainly when the first release is unhealthy, with nothing to roll back to", async () => {
      const fake = fakeTools({ live: "missing", unhealthy: ["production"] });
      const error = await failure(promote(PROJECT, fake.tools, { origin: WORKERS_DEV }));
      expect(error.message).toContain("no earlier version to roll back to");
    });
  });
});

describe("rollback", () => {
  it("sends traffic back to the version live before the current one and checks it at the site", async () => {
    const fake = fakeTools();

    const summary = await rollback(PROJECT, undefined, fake.tools);

    expect(fake.wranglerCommands()).toEqual([
      `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
      `wrangler deployments list --name tide-and-tumble --json ${CONFIG}`,
      `wrangler rollback ${OLDER} --name tide-and-tumble --message Manual rollback from ${OLD} --yes ${CONFIG}`,
    ]);
    expect(fake.asked).toEqual([PROJECT.origin]);
    expect(fake.checks).toMatchObject([{ check: "rollback", baseUrl: PROJECT.origin, expectVersion: OLDER }]);
    expect(summary).toEqual({
      ok: true,
      blocked: false,
      versionId: OLDER,
      tag: SHA,
      replacedVersionId: OLD,
      url: PROJECT.origin,
    });
  });

  it("goes to a named version, and refuses anything that is not a version id", async () => {
    const fake = fakeTools();
    expect((await rollback(PROJECT, OLDER, fake.tools)).versionId).toBe(OLDER);
    await expect(rollback(PROJECT, "--help", fakeTools().tools)).rejects.toThrow("Usage");
  });

  it("refuses the live version, a Worker never deployed, and no earlier version", async () => {
    expect((await failure(rollback(PROJECT, OLD, fakeTools().tools))).message).toContain("already the live one");
    expect((await failure(rollback(PROJECT, undefined, fakeTools({ live: "missing" }).tools))).message).toContain("never been deployed");
    const onlyOne = fakeTools({ history: [deployment("2026-11-27T12:00:00Z", OLD)] });
    expect((await failure(rollback(PROJECT, undefined, onlyOne.tools))).message).toContain("no earlier version");
  });

  it("changes nothing when the site is not served by the live version, and says how to roll back by hand", async () => {
    const fake = fakeTools({ answering: null });

    const error = await failure(rollback(PROJECT, undefined, fake.tools));

    expect(error.message).toContain("not served by this Worker's live version");
    expect(error.message).toContain(`npx wrangler rollback ${OLDER} --name tide-and-tumble --config wrangler.jsonc`);
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler rollback"))).toBe(false);
  });

  it("refuses at workers.dev when it cannot say which version answers, rather than roll back unconfirmed", async () => {
    const fake = fakeTools({ devAnswering: null });
    const error = await failure(rollback(PROJECT, undefined, fake.tools, { origin: WORKERS_DEV }));
    expect(error.message).toContain("did not say which version answers");
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler rollback"))).toBe(false);
  });

  it("reports a blocked check of the rollback as unconfirmed, not unhealthy", async () => {
    const fake = fakeTools({ blocked: ["rollback"] });
    const summary = await rollback(PROJECT, undefined, fake.tools);
    expect(summary).toMatchObject({ ok: false, blocked: true, versionId: OLDER });
  });
});
