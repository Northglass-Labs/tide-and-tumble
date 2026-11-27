import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readProject } from "../../scripts/lib/project.mjs";
import { TAG_ARGS } from "../../scripts/lib/release.mjs";

const GITHUB = new URL("../../.github/", import.meta.url);
const workflows = readdirSync(new URL("workflows/", GITHUB)).map((name) => ({
  name,
  text: readFileSync(new URL(`workflows/${name}`, GITHUB), "utf8"),
}));

const workflow = (name: string) => workflows.find((candidate) => candidate.name === name)?.text ?? "";

/** One job's lines: from `  <job>:` to the next line at the jobs' indentation. */
function jobSection(text: string, job: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(`  ${job}:`);
  if (start === -1) {
    return "";
  }
  const end = lines.findIndex((line, index) => index > start && /^ {0,2}\S/.test(line));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

/** A job's steps, each as its text from the `- ` on. */
const stepsOf = (job: string) => job.split(/\n {6}- /).slice(1);

/** The value of a key at one indentation, with the lines of a block value (`|`, `>-`) joined to it. */
function keyValue(text: string, key: string, indent: number): string {
  const prefix = `${" ".repeat(indent)}${key}:`;
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(prefix));
  if (start === -1) {
    return "";
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => new RegExp(`^ {0,${indent}}\\S`).test(line));
  return [lines[start]!.slice(prefix.length), ...rest.slice(0, end === -1 ? undefined : end)].join("\n").trim();
}

/** The value of one key of a step (as `stepsOf` returns it). */
const stepValue = (step: string, key: string) => keyValue(`        ${step}`, key, 8);

/** The value of one key of a job (as `jobSection` returns it). */
const jobValue = (job: string, key: string) => keyValue(job, key, 4);

/** A step's `run` script as the shell gets it: a block's indicator dropped and its indentation removed. */
function scriptOf(step: string): string {
  const value = stepValue(step, "run");
  if (!/^[|>]/.test(value)) {
    return value;
  }
  const lines = value.split("\n").slice(1);
  const indent = Math.min(...lines.filter((line) => line.trim() !== "").map((line) => /^ */.exec(line)![0].length));
  return lines.map((line) => line.slice(indent)).join("\n");
}

/** Runs a step's script as a runner does (`bash -e`), with only the given variables, and returns what it wrote. */
function runStep(step: string, env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "workflow-step-"));
  const summary = join(dir, "summary");
  const output = join(dir, "output");
  writeFileSync(summary, "");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["-e", "-c", scriptOf(step)], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    summary: readFileSync(summary, "utf8"),
    output: readFileSync(output, "utf8"),
  };
}

/**
 * A PATH whose `gh` answers `answer` when called with exactly `expected` (and fails otherwise, or when
 * `answer` is null), ahead of everything else.
 */
function fakeGh(expected: string, answer: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    answer === null
      ? '#!/bin/sh\necho "HTTP 502: Bad Gateway" >&2\nexit 1\n'
      : `#!/bin/sh\n[ "$*" = '${expected}' ] || { echo "unexpected: gh $*" >&2; exit 2; }\necho '${answer}'\n`,
  );
  chmodSync(gh, 0o755);
  return `${dir}:${process.env.PATH ?? ""}`;
}

/**
 * A PATH whose `gh` answers each call by its exact arguments: the routed text, or a failure for null or for a
 * call it does not know.
 */
function fakeGhRoutes(routes: Record<string, string | null>) {
  const dir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  const key = (args: string) => args.replace(/[^A-Za-z0-9]/g, "_");
  for (const [args, answer] of Object.entries(routes)) {
    if (answer !== null) writeFileSync(join(dir, `${key(args)}.json`), answer);
  }
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    `#!/bin/sh\nfile="${dir}/$(printf '%s' "$*" | tr -c 'A-Za-z0-9' '_').json"\n` +
      `[ -f "$file" ] || { echo "HTTP 502: Bad Gateway (gh $*)" >&2; exit 1; }\ncat "$file"\n`,
  );
  chmodSync(gh, 0o755);
  return `${dir}:${process.env.PATH ?? ""}`;
}

/** The step of a job whose `name` or `run` contains the text. */
const stepWith = (job: string, text: string) =>
  stepsOf(job).find((step) => stepValue(step, "name").includes(text) || stepValue(step, "run").includes(text)) ?? "";

describe("GitHub workflows", () => {
  it("pin every action to a commit, with the version in a comment", () => {
    const uses = workflows.flatMap(({ name, text }) =>
      text
        .split("\n")
        .filter((line) => /^\s*-?\s*uses:/.test(line))
        .map((line) => `${name}: ${line.trim()}`),
    );

    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/);
    }
  });

  it("give the Cloudflare token to the release step only", () => {
    const deploy = workflows.find((workflow) => workflow.name === "deploy.yml")?.text ?? "";
    const steps = deploy.split(/\n\s{6}- /).slice(1);
    const withToken = steps.filter((step) => step.includes("secrets.CLOUDFLARE_API_TOKEN"));

    // The step that checks whether the secret exists, and `npm run promote`.
    expect(withToken).toHaveLength(2);
    expect(withToken[0]).toContain("Deploy skipped");
    expect(withToken[1]).toContain("npm run promote");
    // The account id is not a credential, but it is an identifier this public repository and its public logs never
    // show: as a secret, GitHub masks it in the logs; a variable is printed in the clear.
    expect(withToken[1]).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    for (const { text } of workflows) {
      expect(text).not.toMatch(/vars\.CLOUDFLARE/);
    }
    for (const step of steps.filter((candidate) => /npm (ci|run verify)/.test(candidate))) {
      expect(step).not.toContain("CLOUDFLARE_API_TOKEN");
    }
  });

  it("ask for no more than read access to the repository", () => {
    for (const { text } of workflows) {
      expect(text).toMatch(/\npermissions:\n {2}contents: read\n/);
    }
  });

  it("check a release for known vulnerabilities after verify and before promote, without the token", () => {
    const deploy = stepsOf(jobSection(workflow("deploy.yml"), "deploy"));
    const at = (command: string) => deploy.findIndex((step) => stepValue(step, "run") === command);
    const audit = at("npm run audit");
    expect(at("npm run verify")).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(at("npm run verify"));
    expect(audit).toBeLessThan(at("npm run promote"));
    expect(deploy[audit]).not.toContain("CLOUDFLARE_API_TOKEN");
  });

  it("queue releases per branch, never cancelling one halfway", () => {
    // GitHub keeps one waiting run per concurrency group and cancels the one already waiting, so a dispatch on
    // another branch (which releases nothing) must not share main's group.
    const deploy = workflow("deploy.yml");
    expect(deploy).toMatch(/\nconcurrency:\n {2}group: deploy-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: false\n/);
  });

  it("can be started by name, and release only from main", () => {
    // The merge job in ci.yml starts a release with a dispatch: a merge made with a workflow's own token starts
    // no push workflow.
    const deploy = workflow("deploy.yml");
    expect(deploy).toMatch(/\non:\n(?: {2}.*\n|\s*#.*\n|\s*\n)* {2}workflow_dispatch:/);
    expect(jobSection(deploy, "deploy")).toMatch(/\n {4}if: github\.ref == 'refs\/heads\/main'\n/);
  });

  it("release only main's head, so a re-run of an old run cannot put its old commit over a newer one", () => {
    // A re-run runs for the commit it first ran for: GITHUB_SHA, which main may have left since.
    const steps = stepsOf(jobSection(workflow("deploy.yml"), "deploy"));
    const index = steps.findIndex((step) => stepValue(step, "run").includes("/commits/main"));
    const promote = steps.findIndex((step) => stepValue(step, "run") === "npm run promote");
    expect(index).toBe(promote - 1);
    const head = steps[index]!;
    expect(stepValue(head, "env")).toContain("GH_TOKEN: ${{ github.token }}");
    expect(stepValue(head, "if")).toBe("steps.token.outputs.present == 'true'");
    expect(stepValue(steps[promote]!, "if")).toBe(
      "steps.token.outputs.present == 'true' && steps.head.outputs.current == 'true'",
    );

    const main = "0123456789abcdef0123456789abcdef01234567";
    const old = "fedcba9876543210fedcba9876543210fedcba98";
    const call = "api repos/example/app/commits/main --jq .sha";
    const env = { GITHUB_REPOSITORY: "example/app" };

    const current = runStep(head, { ...env, PATH: fakeGh(call, main), GITHUB_SHA: main });
    expect(current.status).toBe(0);
    expect(current.output).toBe("current=true\n");

    const stale = runStep(head, { ...env, PATH: fakeGh(call, main), GITHUB_SHA: old });
    expect(stale.status).toBe(0);
    expect(stale.output).toBe("current=false\n");
    expect(stale.stdout).toMatch(/^::notice title=Deploy skipped::/);
    expect(stale.stdout).toContain(main);
    // A push to main with [skip ci] in its message starts no Deploy run, so none may be coming.
    expect(stale.stdout).toContain("if none is queued, run Deploy on main");

    // When main's head cannot be read, the run fails rather than releasing or skipping without a word.
    const unreadable = runStep(head, { ...env, PATH: fakeGh(call, null), GITHUB_SHA: main });
    expect(unreadable.status).not.toBe(0);
    expect(unreadable.output).toBe("");
  });

  it("run CI on every pull request and on every push to main", () => {
    // main itself is checked on GitHub's runners, not only the pull requests into it.
    expect(workflow("ci.yml")).toMatch(/\non:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n/);
  });

  it("check for known vulnerabilities after verify", () => {
    const ci = stepsOf(jobSection(workflow("ci.yml"), "verify"));
    const verify = ci.findIndex((step) => stepValue(step, "run") === "npm run verify");
    expect(verify).toBeGreaterThan(-1);
    expect(ci.findIndex((step) => stepValue(step, "run") === "npm run audit")).toBeGreaterThan(verify);
  });

  it("merge only Dependabot's own patch and minor updates, on its pull requests", () => {
    const job = jobSection(workflow("ci.yml"), "merge-dependabot");
    expect(job).toMatch(/\n {4}needs: verify\n/);
    const jobIf = jobValue(job, "if");
    // A push to main runs this workflow too; the merge job is for pull requests only.
    expect(jobIf).toContain("github.event_name == 'pull_request'");
    expect(jobIf).toContain("github.event.pull_request.user.login == 'dependabot[bot]'");
    expect(jobIf).toContain("github.actor == 'dependabot[bot]'");
    expect(jobIf).not.toContain("||"); // all must hold

    const steps = stepsOf(job);
    expect(steps.some((step) => /uses: dependabot\/fetch-metadata@/.test(step))).toBe(true);
    const merge = steps.find((step) => stepValue(step, "run").includes("gh pr merge")) ?? "";
    const condition = stepValue(merge, "if");
    expect(condition).toContain("version-update:semver-patch");
    expect(condition).toContain("version-update:semver-minor");
    expect(condition).toMatch(/maintainer-changes != 'true'/);
    expect(condition).not.toContain("semver-major");

    const script = stepValue(merge, "run");
    expect(script).toMatch(/gh pr merge \S+ --squash --match-head-commit \S+/);
    // The pull request's values reach the scripts through env, never pasted into them.
    for (const step of steps) {
      expect(stepValue(step, "run")).not.toContain("${{");
    }
    // A merge or a dispatch GitHub refuses fails the job.
    expect(job).not.toContain("continue-on-error");
  });

  it("leave a minor update of a package below 1.0 for review, since there semver lets a minor change anything", () => {
    const job = jobSection(workflow("ci.yml"), "merge-dependabot");
    const steps = stepsOf(job);
    const look = steps.find((step) => stepValue(step, "name") === "Look for a minor update below 1.0") ?? "";
    expect(stepValue(look, "env")).toContain("UPDATES: ${{ steps.metadata.outputs.updated-dependencies-json }}");
    const merge = steps.find((step) => stepValue(step, "run").includes("gh pr merge")) ?? "";
    expect(stepValue(merge, "if")).toContain("steps.below_one.outputs.packages == ''");

    const packages = (updates: unknown) => runStep(look, { UPDATES: JSON.stringify(updates) });
    const update = (name: string, type: string, prevVersion?: string, newVersion?: string) => ({
      dependencyName: name,
      updateType: `version-update:semver-${type}`,
      ...(prevVersion ? { prevVersion } : {}),
      ...(newVersion ? { newVersion } : {}),
    });
    expect(packages([update("drizzle-orm", "minor", "0.45.1", "0.46.0")]).output).toBe("packages=drizzle-orm\n");
    expect(packages([update("drizzle-orm", "patch", "0.45.1", "0.45.2")]).output).toBe("packages=\n");
    expect(packages([update("react", "minor", "19.1.0", "19.2.0")]).output).toBe("packages=\n");
    // In a group, one such package is enough; and a version that cannot be read counts as below 1.0.
    expect(
      packages([update("react", "minor", "19.1.0", "19.2.0"), update("drizzle-kit", "minor", "0.31.4", "0.32.0")]).output,
    ).toBe("packages=drizzle-kit\n");
    expect(packages([update("mystery", "minor")]).output).toBe("packages=mystery\n");
    // A version that cannot be read could be 0.0.x, so even a patch waits.
    expect(packages([update("mystery", "patch")]).output).toBe("packages=mystery\n");
    expect(
      packages([{ dependencyName: "blank", updateType: "version-update:semver-patch", prevVersion: "", newVersion: "" }])
        .output,
    ).toBe("packages=blank\n");
    expect(
      packages([{ dependencyName: "blank", updateType: "version-update:semver-minor", prevVersion: "", newVersion: "" }])
        .output,
    ).toBe("packages=blank\n");
    // Below 0.1 even a patch may change anything: ^0.0.3 allows only 0.0.3. A "v" before the number is read too.
    expect(packages([update("tiny", "patch", "0.0.3", "0.0.4")]).output).toBe("packages=tiny\n");
    expect(packages([update("tiny", "patch", "v0.0.3", "v0.0.4")]).output).toBe("packages=tiny\n");
    expect(packages([update("small", "minor", "v0.4.0", "v0.5.0")]).output).toBe("packages=small\n");
    expect(packages([update("small", "patch", "0.4.0", "0.4.1")]).output).toBe("packages=\n");
    // A name that is not an npm name cannot add a line, and so an output, of its own.
    const odd = packages([update("evil\nautomatic=true", "minor", "0.1.0", "0.2.0")]).output;
    expect(odd).toBe("packages=evil?automatic?true\n");
    // With no list of packages, nothing can be said, so the step fails and nothing merges.
    for (const updates of ["", "[]", "not json"]) {
      const result = runStep(look, { UPDATES: updates });
      expect(result.status).not.toBe(0);
      expect(result.output).toBe("");
    }
  });

  it("name every Deploy step, so the merge job can read a run's steps by name", () => {
    // Unnamed steps get generated names, and the checkout step's would change with its pin.
    const steps = stepsOf(jobSection(workflow("deploy.yml"), "deploy"));
    expect(steps.map((step) => stepValue(step, "name"))).toEqual([
      "Check for a Cloudflare token",
      "Check out",
      "Set up Node",
      "Install",
      "Verify",
      "Audit",
      "Check the head of main",
      "Release",
    ]);
    expect(stepValue(steps.at(-1)!, "run")).toBe("npm run promote");
  });

  describe("the merge job's check that releases are automatic", () => {
    const job = () => jobSection(workflow("ci.yml"), "merge-dependabot");
    const check = () => stepsOf(job())[0] ?? "";
    const RUNS = "api repos/example/app/actions/workflows/deploy.yml/runs?branch=main&status=completed&per_page=30";
    const jobsOf = (id: number) => `api repos/example/app/actions/runs/${id}/jobs`;

    /**
     * A completed Deploy run on main, and its job's steps by name (null: no job ran). Its conclusion is success,
     * or cancelled when no job ran, unless given.
     */
    function deployRun(id: number, steps: Record<string, string> | null, event = "push", conclusion?: string) {
      const run = {
        id,
        event,
        head_branch: "main",
        status: "completed",
        conclusion: conclusion ?? (steps ? "success" : "cancelled"),
      };
      const jobs = {
        total_count: steps ? 1 : 0,
        jobs: steps
          ? [{ name: "deploy", steps: Object.entries(steps).map(([name, conclusion]) => ({ name, conclusion })) }]
          : [],
      };
      return { run, jobs };
    }
    const released = { "Check for a Cloudflare token": "success", "Check the head of main": "success", Release: "success" };
    const noToken = { "Check for a Cloudflare token": "success", "Check the head of main": "skipped", Release: "skipped" };
    const olderCommit = { "Check for a Cloudflare token": "success", "Check the head of main": "success", Release: "skipped" };
    const failed = { "Check for a Cloudflare token": "success", "Check the head of main": "success", Release: "failure" };

    /** Runs the check with a stand-in gh that answers these Deploy runs (null: that call fails). */
    function decide(runs: ReturnType<typeof deployRun>[] | null, failingJobs: number[] = []) {
      const routes: Record<string, string | null> = {
        [RUNS]: runs === null ? null : JSON.stringify({ total_count: runs.length, workflow_runs: runs.map((r) => r.run) }),
      };
      for (const { run, jobs } of runs ?? []) {
        routes[jobsOf(run.id)] = failingJobs.includes(run.id) ? null : JSON.stringify(jobs);
      }
      const result = runStep(check(), { PATH: fakeGhRoutes(routes), GH_REPO: "example/app" });
      expect(result.status).toBe(0);
      return result.output;
    }

    it("reads the Deploy runs with the job's own token, and refers to no secret", () => {
      expect(stepValue(check(), "name")).toBe("Check that releases are automatic");
      expect(stepValue(check(), "env")).toContain("GH_TOKEN: ${{ github.token }}");
      expect(job()).not.toContain("secrets.");
      const merge = stepsOf(job()).find((step) => stepValue(step, "run").includes("gh pr merge")) ?? "";
      expect(stepValue(merge, "if")).toContain("steps.releases.outputs.automatic == 'true'");
    });

    it("says automatic when the newest run that released or tried to released", () => {
      expect(decide([deployRun(101, released)])).toBe("automatic=true\nreason=Deploy run 101 on main released\n");
    });

    it("says not automatic when that run released nothing, as without a token, or failed", () => {
      expect(decide([deployRun(101, noToken)])).toBe(
        "automatic=false\nreason=the newest Deploy run on main that tried to release, 101, did not: its Release step was skipped\n",
      );
      expect(decide([deployRun(102, failed), deployRun(101, released)])).toContain("automatic=false\n");
    });

    it("passes over runs that say nothing: one for an older commit, and one cancelled before it started", () => {
      expect(decide([deployRun(103, olderCommit, "workflow_dispatch"), deployRun(102, null), deployRun(101, released)])).toBe(
        "automatic=true\nreason=Deploy run 101 on main released\n",
      );
      expect(decide([deployRun(102, null), deployRun(101, olderCommit)])).toBe(
        "automatic=false\nreason=no Deploy run on main has released or tried to\n",
      );
      expect(decide([])).toContain("automatic=false\n");
    });

    it("says not automatic when the newest run failed before its steps, rather than passing over it", () => {
      // An invalid workflow, or an action that cannot be resolved: no Release step, but not cancelled either.
      expect(decide([deployRun(103, null, "push", "startup_failure"), deployRun(101, released)])).toBe(
        "automatic=false\nreason=the newest Deploy run on main that tried to release, 103, did not: it ended (startup_failure) before its Release step\n",
      );
      expect(decide([deployRun(102, { "Set up job": "failure" }, "push", "failure"), deployRun(101, released)])).toBe(
        "automatic=false\nreason=the newest Deploy run on main that tried to release, 102, did not: it ended (failure) before its Release step\n",
      );
    });

    it("counts only runs started by a push or by hand", () => {
      expect(decide([deployRun(104, released, "repository_dispatch")])).toContain("automatic=false\n");
    });

    it("says not automatic when the Actions API cannot be read", () => {
      const unread = "automatic=false\nreason=the Actions API could not be read\n";
      expect(decide(null)).toBe(unread);
      expect(decide([deployRun(101, released)], [101])).toBe(unread);
    });

    it("says so in the summary, with the reason", () => {
      const say = stepWith(job(), "Say what happened");
      const summary = runStep(say, {
        PR_URL: "https://github.com/example/app/pull/7",
        AUTOMATIC: "false",
        REASON: "no Deploy run on main has released or tried to",
        METADATA: "success",
        MERGE: "skipped",
        RELEASE: "skipped",
      }).summary.trim();
      expect(summary).toBe(
        "Left for review: https://github.com/example/app/pull/7. Releases are not automatic yet (no Deploy run on main has released or tried to), so a merge would not reach production. Merge it after review and release it from a workstation (docs/DELIVERY.md).",
      );
    });
  });

  it("start the release in a step of its own, only after a merge", () => {
    const job = jobSection(workflow("ci.yml"), "merge-dependabot");
    expect(stepValue(stepWith(job, "gh pr merge"), "run")).not.toContain("gh workflow run");
    const release = stepWith(job, "gh workflow run");
    expect(stepValue(release, "run")).toBe("gh workflow run deploy.yml --ref main");
    expect(stepValue(release, "if")).toBe("steps.merge.outcome == 'success'");
  });

  it("say plainly in the run's summary what happened to the update", () => {
    const step = stepWith(jobSection(workflow("ci.yml"), "merge-dependabot"), "Say what happened");
    expect(stepValue(step, "if")).toBe("always()");
    const update = {
      PR_URL: "https://github.com/example/app/pull/7",
      HEAD_SHA: "0123456789abcdef0123456789abcdef01234567",
      AUTOMATIC: "true",
      METADATA: "success",
      UPDATE_TYPE: "version-update:semver-minor",
      MAINTAINER_CHANGES: "false",
      TRUNCATED: "false",
    };
    const summary = (outcomes: Record<string, string>) => runStep(step, { ...update, ...outcomes }).summary.trim();

    expect(summary({ MERGE: "success", RELEASE: "success" })).toBe(
      "Merged https://github.com/example/app/pull/7 at 0123456789abcdef0123456789abcdef01234567, and started the release (deploy.yml on main).",
    );
    expect(summary({ MERGE: "success", RELEASE: "failure" })).toBe(
      "Merged https://github.com/example/app/pull/7 at 0123456789abcdef0123456789abcdef01234567, but the release did not start (failure), so production does not have it. Run the Deploy workflow on main from the Actions tab.",
    );
    expect(summary({ MERGE: "skipped", RELEASE: "skipped", UPDATE_TYPE: "version-update:semver-major" })).toBe(
      "Left for review: https://github.com/example/app/pull/7 is version-update:semver-major, maintainer changes: false, description truncated: false. Only a patch or minor update whose maintainers did not change and whose description is complete is merged.",
    );
    expect(summary({ METADATA: "failure", MERGE: "skipped", RELEASE: "skipped" })).toBe(
      "Left for review: https://github.com/example/app/pull/7. Its update type could not be read (failure).",
    );
    expect(summary({ MERGE: "failure", RELEASE: "skipped" })).toBe(
      "Left for review: GitHub did not merge https://github.com/example/app/pull/7 (failure). The merge step's log says why.",
    );
    expect(summary({ MERGE: "skipped", RELEASE: "skipped", BELOW_ONE: "drizzle-orm, drizzle-kit" })).toBe(
      "Left for review: https://github.com/example/app/pull/7 updates drizzle-orm, drizzle-kit, below 1.0, where semver lets a minor update (below 0.1, even a patch) change anything.",
    );
    expect(summary({ PACKAGES: "failure", MERGE: "skipped", RELEASE: "skipped" })).toBe(
      "Left for review: https://github.com/example/app/pull/7. Its list of updated packages could not be read (failure).",
    );
  });

  it("leave an update whose description was cut short for review", () => {
    // fetch-metadata finds maintainer changes by reading the description; a long group's is truncated, and the
    // sections it lost are not read.
    const steps = stepsOf(jobSection(workflow("ci.yml"), "merge-dependabot"));
    const merge = steps.find((step) => stepValue(step, "run").includes("gh pr merge")) ?? "";
    expect(stepValue(merge, "if")).toContain("!contains(github.event.pull_request.body, '_Description has been truncated_')");
  });

  it("give the merge job only npm updates into main, named by what is allowed rather than what is not", () => {
    // A pull_request run uses the pull request's own copy of this workflow, so an Actions update would run the
    // fetch-metadata it proposes, with the write token, before any check of the update type. Listing what is
    // allowed keeps every other kind of branch out, including ecosystems added later, and so does the base:
    // a pull request into another branch is not a release.
    const jobIf = jobValue(jobSection(workflow("ci.yml"), "merge-dependabot"), "if");
    expect(jobIf).toContain("startsWith(github.head_ref, 'dependabot/npm_and_yarn/')");
    expect(jobIf).toContain("github.event.pull_request.base.ref == 'main'");
    expect(jobIf).not.toContain("!startsWith");
  });

  it("let only the merge job write, and run nothing from the pull request there", () => {
    const job = jobSection(workflow("ci.yml"), "merge-dependabot");
    for (const permission of ["contents: write", "pull-requests: write", "actions: write"]) {
      expect(job).toContain(permission);
    }
    expect(job).not.toContain("actions/checkout");
    expect(job).not.toContain("npm ");
    for (const { name, text } of workflows) {
      expect(name === "ci.yml" ? text.replace(job, "") : text).not.toContain(": write");
    }
  });

  it("release main's head every night, after midnight in every US mainland time zone and before the daily check", () => {
    // The beach pages carry a tide table built with them; the nightly release keeps it at most a day old.
    const deploy = workflow("deploy.yml");
    expect(deploy).toMatch(/\n {2}schedule:\n/);
    const crons = [...deploy.matchAll(/cron: "([^"]+)"/g)].map((match) => match[1]!.split(" "));
    expect(crons).toHaveLength(1);
    const [minute, hour, day, month, weekday] = crons[0]!;
    expect([day, month, weekday]).toEqual(["*", "*", "*"]);
    expect(minute).not.toBe("0");
    // 08:00 UTC is midnight in the Pacific (standard time); the daily production check runs at 11:41 UTC.
    expect(Number(hour)).toBeGreaterThanOrEqual(8);
    expect(Number(hour)).toBeLessThan(11);
    // A scheduled run takes the same path as a push: verify, audit, main's head, promote.
    expect(stepsOf(jobSection(deploy, "deploy")).map((step) => stepValue(step, "name"))).toContain("Check the head of main");
  });

  it("check every day, strictly", () => {
    const audit = workflow("audit.yml");
    expect(audit).toMatch(/\n {2}schedule:\n/);
    const crons = [...audit.matchAll(/cron: "([^"]+)"/g)].map((match) => match[1]!.split(" "));
    expect(crons).toHaveLength(1);
    const [minute, , day, month, weekday] = crons[0]!;
    expect([day, month, weekday]).toEqual(["*", "*", "*"]); // every day
    expect(minute).not.toBe("0"); // off the hour, when GitHub's scheduler is busiest
    expect(audit).toMatch(/\n {2}workflow_dispatch:/);
    const steps = stepsOf(jobSection(audit, "audit"));
    expect(steps.some((step) => stepValue(step, "run") === "npm run audit -- --strict")).toBe(true);
  });

  it("check every day that production runs the head of main, once releases are automatic", () => {
    // A fix that merged but never reached production would otherwise reach nobody: Dependabot and the workflow
    // token are not people. The scheduled run's failure email reaches the owner.
    const job = jobSection(workflow("audit.yml"), "production");
    // Started by hand on another branch, it would compare production with that branch's head and fail for nothing.
    expect(jobValue(job, "if")).toBe("github.ref == 'refs/heads/main'");
    const [check, ...rest] = stepsOf(job);
    expect(stepValue(check!, "env")).toContain("AUTOMATIC: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}");
    expect(rest.length).toBeGreaterThan(0);
    for (const step of rest) {
      expect(stepValue(step, "if")).toBe("steps.releases.outputs.automatic == 'true'");
    }
    // Tagged as promote tags a release, at the site's own address: the workers.dev one carries the account's
    // subdomain, which this public repository and its public logs never name.
    const health = stepWith(job, "npm run health");
    const { origin } = readProject();
    expect(stepValue(health, "run")).toBe(`npm run health -- ${origin} --expect-tag "$(git ${TAG_ARGS.join(" ")})"`);
  });

  it("pass with a notice until releases are automatic, and check production once they are", () => {
    const check = stepsOf(jobSection(workflow("audit.yml"), "production"))[0]!;

    const off = runStep(check, { AUTOMATIC: "false" });
    expect(off.status).toBe(0);
    expect(off.output).toBe("automatic=false\n");
    expect(off.stdout).toMatch(/^::notice title=Production is not released automatically yet::/);

    const on = runStep(check, { AUTOMATIC: "true" });
    expect(on.status).toBe(0);
    expect(on.output).toBe("automatic=true\n");
    expect(on.stdout).toBe("");
  });

  it("never put the Cloudflare token's value in the daily workflow", () => {
    const audit = workflow("audit.yml");
    const uses = [...audit.matchAll(/secrets\.CLOUDFLARE_API_TOKEN(.{0,6})/g)].map((match) => match[1]);
    expect(uses).toEqual([" != ''"]);
  });
});

describe("Dependabot", () => {
  const config = readFileSync(new URL("dependabot.yml", GITHUB), "utf8");

  it("holds a package only with the date and the reason written above it", () => {
    const lines = config.split("\n");
    const holds = lines.flatMap((line, index) => (/^\s*- dependency-name:/.test(line) ? [index] : []));
    expect(holds.length).toBe(2);
    for (const index of holds) {
      // The comment block directly above the entry starts with the date it was decided.
      let start = index - 1;
      while (start > 0 && lines[start - 1]!.trim().startsWith("#")) start -= 1;
      expect(lines[start]).toMatch(/^\s*# \d{4}-\d{2}-\d{2}: \S/);
    }
    expect(config).toMatch(/dependency-name: "typescript"\n\s*versions: \[">=6\.1\.0"\]/);
    expect(config).toMatch(/dependency-name: "eslint"\n\s*versions: \[">=10\.0\.0"\]/);
  });

  it("updates npm and Actions weekly, grouped, after a three-day wait", () => {
    for (const ecosystem of ["npm", "github-actions"]) {
      const section = config.split("- package-ecosystem:").find((part) => part.trimStart().startsWith(`"${ecosystem}"`));

      expect(section).toContain('interval: "weekly"');
      expect(section).toContain("default-days: 3");
      expect(section).toMatch(/minor-and-patch:[\s\S]*update-types: \["minor", "patch"\]/);
      expect(section).toMatch(/major:[\s\S]*update-types: \["major"\]/);
    }
  });
});
