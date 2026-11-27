import { describe, expect, it } from "vitest";
import { checkAddress, NIGHTLY_REFRESH, prepareRelease, promote, rollback } from "../../scripts/lib/release.mjs";
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
const PREV = "44444444-4444-4444-8444-444444444444";
/** The clean copy of the commit that prepare-release builds in. */
const TREE = "/tmp/tide-and-tumble-release-x/tree";
const DIGEST = "d".repeat(64);
const FETCH = "git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main";

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
  /** Set when running on GitHub Actions: the ref, commit and event GitHub says this run is for. */
  github?: { ref: string; sha: string; event?: string };
  /** Names of the Cloudflare credentials in the environment. */
  credentials?: string[];
  /** Files git does not fully see: marked assume-unchanged or skip-worktree. */
  hidden?: string[];
  /** Symbolic links committed in the tree. */
  trackedLinks?: string[];
  /** `npm ci --ignore-scripts` and `npm run verify` in the clean copy. */
  install?: Result;
  verify?: Result;
  /** What is in out/: the clean copy's after its build, and the checkout's after the copy. */
  output?: { files: string[]; links: string[] };
  /** What prepare-release recorded; by default this commit's build. */
  prepared?: { commit: string; tag: string; digest: string } | null;
  /** The digest of the checkout's out/; by default the recorded one. */
  digest?: string;
  /** The digest of the checkout's out/ once the upload has read it, if it changed meanwhile. */
  digestAfterUpload?: string;
  /** Beach pages built without their tide table. */
  missingTables?: string[];
  /** The tag of each version, as `wrangler versions view` reports it. */
  tags?: Record<string, string | null>;
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
  const recorded: unknown[] = [];
  const said: string[] = [];
  let live = scenario.live ?? OLD;
  let statusCalls = 0;
  let uploaded = false;
  const tags: Record<string, string | null> = { [OLD]: "0d0d0d0d0d0d", [OLDER]: "0e0e0e0e0e0e", [PREV]: "0f0f0f0f0f0f", [NEW]: SHA, ...scenario.tags };

  const tools = {
    say: (line: string) => {
      said.push(line);
    },
    github: scenario.github ? { event: "push", ...scenario.github } : null,
    credentials: () => scenario.credentials ?? [],
    buildOutput: (root?: string) => {
      commands.push(`list ${root ?? "out/"}`);
      return scenario.output ?? { files: ["index.html", ".assetsignore", "_headers"], links: [] };
    },
    outDigest: (root?: string) => {
      if (root !== undefined) return DIGEST;
      if (uploaded && scenario.digestAfterUpload !== undefined) return scenario.digestAfterUpload;
      return scenario.digest ?? DIGEST;
    },
    missingTables: () => scenario.missingTables ?? [],
    prepared: () => (scenario.prepared === undefined ? { commit: FULL_SHA, tag: SHA, digest: DIGEST } : scenario.prepared),
    writePrepared: (record: unknown) => {
      recorded.push(record);
    },
    clearGenerated: () => {
      commands.push("clear out/");
    },
    createBuildTree: (commit: string) => {
      commands.push(`make a clean copy of ${commit}`);
      return TREE;
    },
    removeBuildTree: (dir: string) => {
      commands.push(`remove ${dir}`);
    },
    copyBuild: (from: string) => {
      commands.push(`copy ${from}/out to out/`);
    },
    runIn: (dir: string, command: string, args: string[]): Result => {
      const line = `${command} ${args.join(" ")}`;
      commands.push(`in ${dir}: ${line}`);
      if (line === "npm ci --ignore-scripts") return scenario.install ?? ok();
      if (line === "npm run verify") return scenario.verify ?? ok();
      throw new Error(`unexpected command in ${dir}: ${line}`);
    },
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
      if (line === "git ls-files -v -z") {
        return ok([...(scenario.hidden ?? []).map((path) => `S ${path}`), "H package.json", "H src/worker/index.ts", ""].join("\0"));
      }
      if (line === "git rev-parse HEAD") return ok(`${FULL_SHA}\n`);
      if (line === FETCH) return ok();
      if (line === "git rev-parse refs/remotes/origin/main") return ok(`${scenario.originMain ?? FULL_SHA}\n`);
      if (line === "git rev-parse --short=12 HEAD") return ok(`${SHA}\n`);
      if (line === "git log -1 --format=%s") return ok("feat: a change\n");
      if (line === `git ls-tree -r -z --full-tree ${FULL_SHA}`) {
        const links = (scenario.trackedLinks ?? []).map((path) => `120000 blob 0123abcd\t${path}`);
        return ok([`100644 blob 4567cdef\tpackage.json`, ...links, ""].join("\0"));
      }
      if (line === "npm ci --ignore-scripts") return scenario.install ?? ok();
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
        const id = args[2] ?? "";
        return (scenario.unknownVersions ?? []).includes(id)
          ? failed("✘ [ERROR] Version not found [code: 10007]")
          : ok(JSON.stringify({ id, annotations: { "workers/tag": tags[id] ?? null } }));
      }
      if (line.startsWith("wrangler versions upload")) {
        uploaded = true;
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

  return {
    tools,
    commands,
    checks,
    asked,
    recorded,
    said,
    wranglerCommands: () => commands.filter((line) => line.startsWith("wrangler")),
  };
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

describe("prepareRelease", () => {
  it("builds and checks a clean copy of main's commit with no credential in reach, then records it for promote", async () => {
    const fake = fakeTools();

    const summary = await prepareRelease(PROJECT, fake.tools);

    expect(fake.commands).toEqual([
      "git status --porcelain",
      "git ls-files -v -z",
      "git rev-parse HEAD",
      FETCH,
      "git rev-parse refs/remotes/origin/main",
      "git rev-parse --short=12 HEAD",
      "git log -1 --format=%s",
      `git ls-tree -r -z --full-tree ${FULL_SHA}`,
      // Nothing an earlier build left may reach this one, and nothing but the commit reaches the build.
      "clear out/",
      `make a clean copy of ${FULL_SHA}`,
      `in ${TREE}: npm ci --ignore-scripts`,
      `in ${TREE}: npm run verify`,
      `list ${TREE}`,
      `copy ${TREE}/out to out/`,
      `remove ${TREE}`,
      // promote runs this checkout's Wrangler: the locked version, installed afresh, install scripts off.
      "npm ci --ignore-scripts",
    ]);
    expect(fake.recorded).toEqual([{ commit: FULL_SHA, tag: SHA, digest: DIGEST }]);
    expect(summary).toEqual({ ok: true, commit: FULL_SHA, tag: SHA, digest: DIGEST });
    expect(fake.wranglerCommands()).toEqual([]);
  });

  it("refuses to run with a Cloudflare credential in its environment, before anything", async () => {
    const fake = fakeTools({ credentials: ["CLOUDFLARE_API_TOKEN"] });
    const error = await failure(prepareRelease(PROJECT, fake.tools));
    expect(error.message).toContain("CLOUDFLARE_API_TOKEN is set");
    expect(fake.commands).toEqual([]);
  });

  it("builds only main's commit, from a checkout git fully sees", async () => {
    expect((await failure(prepareRelease(PROJECT, fakeTools({ originMain: OTHER_SHA }).tools))).message).toContain(
      "release only main",
    );
    expect((await failure(prepareRelease(PROJECT, fakeTools({ dirty: "?? notes.txt\n" }).tools))).message).toContain(
      "commit or stash",
    );
    expect((await failure(prepareRelease(PROJECT, fakeTools({ hidden: ["public/_headers"] }).tools))).message).toContain(
      "skip-worktree",
    );
  });

  it("refuses a commit holding symbolic links, which a build could follow anywhere on the machine", async () => {
    const fake = fakeTools({ trackedLinks: ["public/secret.txt"] });
    const error = await failure(prepareRelease(PROJECT, fake.tools));
    expect(error.details).toBe("public/secret.txt");
    expect(fake.commands).not.toContain("clear out/");
  });

  it("removes the clean copy and records nothing when the build or its checks fail", async () => {
    for (const scenario of [
      { install: failed("npm ERR! code EINTEGRITY") },
      { verify: failed("1 test failed") },
      { output: { files: ["index.html", ".env"], links: [] } },
    ]) {
      const fake = fakeTools(scenario);
      await failure(prepareRelease(PROJECT, fake.tools));
      expect(fake.commands.at(-1)).toBe(`remove ${TREE}`);
      expect(fake.commands).not.toContain(`copy ${TREE}/out to out/`);
      expect(fake.recorded).toEqual([]);
    }
  });

  it("refuses a copy of out/ that is not exactly the build it checked", async () => {
    const fake = fakeTools({ digest: "e".repeat(64) });
    const error = await failure(prepareRelease(PROJECT, fake.tools));
    expect(error.message).toContain("not exactly the build that was checked");
    expect(fake.recorded).toEqual([]);
  });

  it("on GitHub, builds the run's own commit of main without fetching", async () => {
    const fake = fakeTools({ github: { ref: "refs/heads/main", sha: FULL_SHA } });
    await prepareRelease(PROJECT, fake.tools);
    expect(fake.commands).not.toContain(FETCH);
    expect(fake.recorded).toHaveLength(1);
  });
});

describe("promote", () => {
  it("releases the prepared build: confirms production is this Worker, uploads, sends it traffic and checks it", async () => {
    const fake = fakeTools();

    const summary = await promote(PROJECT, fake.tools);

    expect(fake.commands).toEqual([
      "git status --porcelain",
      "git ls-files -v -z",
      "git rev-parse HEAD",
      FETCH,
      "git rev-parse refs/remotes/origin/main",
      "git rev-parse --short=12 HEAD",
      "git log -1 --format=%s",
      // No install and no build: promote holds the token, so the build ran before it, in prepare-release.
      "list out/",
      `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
      `wrangler versions upload --tag ${SHA} --message ${SHA} feat: a change ${CONFIG}`,
      // Read again just before the deploy: has another release changed production meanwhile?
      `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
      `wrangler versions deploy ${NEW}@100% --name tide-and-tumble --message ${SHA} feat: a change --yes ${CONFIG}`,
    ]);
    // The site answered with the live version before anything changed: the zone route is attached.
    expect(fake.asked).toEqual([PROJECT.origin]);
    // Version URLs are off: production is the new version's first check. It must answer with the new version
    // itself, not only its tag: a nightly refresh uploads the same commit again, under the same tag.
    expect(fake.checks).toEqual([{ check: "production", baseUrl: PROJECT.origin, expectTag: SHA, expectVersion: NEW }]);
    expect(summary).toEqual({
      ok: true,
      released: true,
      tag: SHA,
      versionId: NEW,
      previousVersionId: OLD,
      url: PROJECT.origin,
      p95Ms: 40,
    });
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

  it("refuses a checkout with files git does not fully see, whose changes git status would not show", async () => {
    const fake = fakeTools({ hidden: ["src/worker/index.ts"] });
    const error = await failure(promote(PROJECT, fake.tools));
    expect(error.message).toContain("assume-unchanged or skip-worktree");
    expect(error.details).toBe("S src/worker/index.ts");
    expect(fake.wranglerCommands()).toEqual([]);
  });

  it("releases only the commit main is on, on a workstation and on GitHub", async () => {
    const workstation = fakeTools({ originMain: OTHER_SHA });
    expect((await failure(promote(PROJECT, workstation.tools))).message).toContain("release only main");
    expect(workstation.wranglerCommands()).toEqual([]);

    const otherBranch = fakeTools({ github: { ref: "refs/heads/feature", sha: FULL_SHA } });
    expect((await failure(promote(PROJECT, otherBranch.tools))).message).toContain("release only main");

    const onMain = fakeTools({ github: { ref: "refs/heads/main", sha: FULL_SHA } });
    await promote(PROJECT, onMain.tools);
    // On GitHub the run's own commit is trusted; there is no credential to fetch with.
    expect(onMain.commands).not.toContain(FETCH);
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
    expect(await promote(PROJECT, tookEffect.tools)).toMatchObject({ released: true, versionId: NEW });

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

  describe("the build it releases", () => {
    it("must be the one prepare-release built and checked for this commit", async () => {
      for (const prepared of [null, { commit: OTHER_SHA, tag: "fedcba987654", digest: DIGEST }]) {
        const fake = fakeTools({ prepared });
        const error = await failure(promote(PROJECT, fake.tools));
        expect(error.message).toContain("node scripts/prepare-release.mjs");
        expect(fake.wranglerCommands()).toEqual([]);
      }
    });

    it("refuses an out/ that changed after it was checked", async () => {
      const fake = fakeTools({ digest: "e".repeat(64) });
      expect((await failure(promote(PROJECT, fake.tools))).message).toContain("changed after");
      expect(fake.wranglerCommands()).toEqual([]);
    });

    it("stops before traffic moves when out/ changed while the version was uploading", async () => {
      const fake = fakeTools({ digestAfterUpload: "e".repeat(64) });
      const error = await failure(promote(PROJECT, fake.tools));
      expect(error.message).toContain("changed while");
      expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler versions deploy"))).toBe(false);
    });
  });

  describe("the nightly run, which only refreshes the release production runs", () => {
    const nightly = { github: { ref: "refs/heads/main", sha: FULL_SHA, event: "schedule" } };

    it("rebuilds main's head when production runs it, marking the version and the deployment", async () => {
      const fake = fakeTools({ ...nightly, tags: { [OLD]: SHA } });

      const summary = await promote(PROJECT, fake.tools);

      const message = `${NIGHTLY_REFRESH} ${SHA} feat: a change`;
      expect(fake.wranglerCommands()).toEqual([
        `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
        `wrangler versions view ${OLD} --name tide-and-tumble --json ${CONFIG}`,
        `wrangler versions upload --tag ${SHA} --message ${message} ${CONFIG}`,
        `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
        `wrangler versions deploy ${NEW}@100% --name tide-and-tumble --message ${message} --yes ${CONFIG}`,
      ]);
      // The same tag answered before the refresh, so only the new version's id shows the refresh is live.
      expect(fake.checks).toEqual([{ check: "production", baseUrl: PROJECT.origin, expectTag: SHA, expectVersion: NEW }]);
      expect(summary).toMatchObject({ ok: true, released: true, versionId: NEW });
    });

    it("changes nothing when production runs another commit: a rollback stays in place", async () => {
      const fake = fakeTools({ ...nightly, tags: { [OLD]: "0d0d0d0d0d0d" } });

      const summary = await promote(PROJECT, fake.tools);

      expect(summary).toMatchObject({ ok: true, released: false, tag: SHA });
      expect(String((summary as { reason: string }).reason)).toContain("production runs 0d0d0d0d0d0d, not main's head");
      expect(fake.wranglerCommands()).toEqual([
        `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
        `wrangler versions view ${OLD} --name tide-and-tumble --json ${CONFIG}`,
      ]);
      expect(fake.checks).toEqual([]);
    });

    it("changes nothing while traffic is split, or before the Worker exists", async () => {
      for (const live of ["split", "missing"]) {
        const fake = fakeTools({ ...nightly, live });
        expect(await promote(PROJECT, fake.tools)).toMatchObject({ ok: true, released: false });
        expect(fake.wranglerCommands().some((line) => / (upload|deploy) /.test(line))).toBe(false);
      }
    });

    it("never releases a build that lacks a beach page's tide table", async () => {
      const fake = fakeTools({ ...nightly, tags: { [OLD]: SHA }, missingTables: ["tides/nags-head.html"] });
      const error = await failure(promote(PROJECT, fake.tools));
      expect(error.message).toContain("without their tide table");
      expect(error.details).toBe("tides/nags-head.html");
      expect(fake.wranglerCommands()).toEqual([]);
    });

    it("leaves a push's release alone: it releases main's head whatever production runs", async () => {
      const fake = fakeTools({ github: { ref: "refs/heads/main", sha: FULL_SHA, event: "push" }, missingTables: ["tides/x.html"] });
      expect(await promote(PROJECT, fake.tools)).toMatchObject({ released: true });
    });
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
  it("passes over the nightly refreshes of the live commit, to the newest version of an earlier commit", async () => {
    // OLDER is the previous commit; PREV and OLD are the live commit's release and its nightly refresh.
    const fake = fakeTools({
      history: [
        deployment("2026-11-25T08:17:00Z", OLDER),
        deployment("2026-11-26T12:00:00Z", PREV),
        deployment("2026-11-27T08:17:00Z", OLD),
      ],
      tags: { [OLD]: SHA, [PREV]: SHA, [OLDER]: "0e0e0e0e0e0e" },
    });

    expect((await rollback(PROJECT, undefined, fake.tools)).versionId).toBe(OLDER);
  });

  it("asks for a version by name when no earlier commit is among the recent deployments", async () => {
    const fake = fakeTools({ tags: { [OLD]: SHA, [OLDER]: SHA } });
    const error = await failure(rollback(PROJECT, undefined, fake.tools));
    expect(error.message).toContain("npm run rollback -- <versionId>");
    expect(fake.wranglerCommands().some((line) => line.startsWith("wrangler rollback"))).toBe(false);
  });
  it("sends traffic back to the version live before the current one and checks it at the site", async () => {
    const fake = fakeTools();

    const summary = await rollback(PROJECT, undefined, fake.tools);

    expect(fake.wranglerCommands()).toEqual([
      `wrangler deployments status --name tide-and-tumble --json ${CONFIG}`,
      `wrangler deployments list --name tide-and-tumble --json ${CONFIG}`,
      `wrangler versions view ${OLD} --name tide-and-tumble --json ${CONFIG}`,
      `wrangler versions view ${OLDER} --name tide-and-tumble --json ${CONFIG}`,
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
    expect((await failure(rollback(PROJECT, undefined, onlyOne.tools))).message).toContain("ran an earlier commit");
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
