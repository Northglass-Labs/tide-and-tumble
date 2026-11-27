import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { listOutput, outDigest, pagesWithoutTable, strayFiles } from "./build-output.mjs";
import { answeringVersion, checkHealth, realDeps, VERSION_ID } from "./health-check.mjs";
import { ASSETS_DIR, ROOT_PATH, strayConfigs } from "./project.mjs";
import { jsonFrom, must, run, say, StepFailed, wrangler } from "./run.mjs";
import {
  activeVersionId,
  parseVersionUpload,
  previousVersionId,
  redact,
  workerDoesNotExist,
  workersDevOrigin,
} from "./wrangler-output.mjs";

/**
 * The release flow behind `node scripts/prepare-release.mjs`, `npm run
 * promote` and `npm run rollback`, from the app template's reviewed scripts,
 * changed for this app: no database, Version URLs off (design note, D3), and
 * production checked where the operator says it is served (docs/DELIVERY.md,
 * "Where production is checked").
 *
 * The build runs before any step that holds the Cloudflare token.
 * `prepare-release` builds and checks a clean copy of the commit (a detached
 * worktree in a temporary folder) with no Cloudflare credential in its
 * environment and install scripts off, copies that out/ into the checkout and
 * records the commit and a digest of out/. `promote` holds the token, runs no
 * build and no package code but Wrangler's, and uploads that out/ only while
 * it is still exactly what was checked.
 *
 * Everything that touches the outside world (git, npm, Wrangler, the files,
 * the network) comes in through `tools`, so the order of steps and what
 * happens when one fails is tested with stand-ins (test/scripts/release.test.ts).
 */

/** @typedef {import("./wrangler-output.mjs").Deployment} Deployment */
/** @typedef {import("./run.mjs").RunResult} RunResult */
/** @typedef {import("./health-check.mjs").HealthResult} HealthResult */
/** @typedef {{ worker: string, origin: string, configPath: string }} Project */

/**
 * @typedef {object} HealthRequest
 * @property {string} baseUrl
 * @property {string | null} [expectTag]
 * @property {string | null} [expectVersion]
 * @property {number} [waitMs]
 */

/**
 * @typedef {object} Prepared What prepare-release recorded for promote.
 * @property {string} commit The commit it built.
 * @property {string} tag    Its tag.
 * @property {string} digest A digest of the out/ it checked (`outDigest`).
 */

/**
 * @typedef {object} Tools
 * @property {(command: string, args: string[]) => RunResult} run In the checkout.
 * @property {(dir: string, command: string, args: string[]) => RunResult} runIn In another folder: the clean copy.
 * @property {(args: string[]) => RunResult} wrangler
 * @property {(check: string, request: HealthRequest) => Promise<HealthResult>} health
 * @property {(line: string) => void} say
 * @property {{ ref: string, sha: string, event: string } | null} github On GitHub Actions, the ref, commit and
 *   event (push, workflow_dispatch, schedule) GitHub says the run is for; null anywhere else.
 * @property {() => string[]} credentials Names of the Cloudflare credentials in the environment.
 * @property {(root?: string) => { files: string[], links: string[] }} buildOutput What is in `<root>/out/`
 *   (the checkout's by default), relative to it.
 * @property {(root?: string) => string} outDigest A digest of `<root>/out/` as it is now.
 * @property {(root?: string) => string[]} missingTables Beach pages in `<root>/out/` built without their tide table.
 * @property {() => void} clearGenerated Removes the checkout's out/, left by an earlier build.
 * @property {(commit: string) => string} createBuildTree Checks out `commit` alone in a new temporary folder; returns it.
 * @property {(dir: string) => void} removeBuildTree Removes a folder createBuildTree made.
 * @property {(from: string) => void} copyBuild Copies `<from>/out/` to the checkout's out/, which must not exist.
 * @property {() => Prepared | null} prepared What prepare-release recorded, if anything.
 * @property {(record: Prepared) => void} writePrepared
 * @property {() => string[]} strayConfigs wrangler.json or wrangler.toml files in the repository or above it.
 * @property {(baseUrl: string) => Promise<{ versionId: string | null, detail: string }>} answeringVersion
 *   The version the site says is answering, or null with the reason.
 */

/** How long a release may take to reach every Cloudflare location before a check gives up. */
export const SETTLE_MS = 90_000;

/**
 * How a release is tagged: `git` with these arguments, the commit shortened to
 * 12 characters. The daily check in .github/workflows/audit.yml compares
 * production with the same.
 */
export const TAG_ARGS = ["rev-parse", "--short=12", "HEAD"];

/** How a nightly refresh marks the versions and deployments it makes. */
export const NIGHTLY_REFRESH = "Nightly refresh:";

/** The Cloudflare credentials Wrangler reads from the environment. The account id is an identifier, not one. */
const CREDENTIALS = Object.freeze(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "CF_API_TOKEN", "CF_API_KEY"]);

/**
 * Names of the Cloudflare credentials set in an environment.
 *
 * @param {Record<string, string | undefined>} env
 */
export function credentialVariables(env) {
  return CREDENTIALS.filter((name) => (env[name] ?? "") !== "");
}

/** Where createBuildTree makes its folders, and the only folders removeBuildTree removes. */
const BUILD_TREE_PREFIX = join(tmpdir(), "tide-and-tumble-release-");

/** Where prepare-release records what it built: under node_modules/, which git ignores and `npm ci` replaces. */
const PREPARED_PATH = join(ROOT_PATH, "node_modules", ".cache", "tide-and-tumble-release.json");

/** Brings GitHub's main into origin/main, whatever the local remote configuration says. */
const FETCH_MAIN = Object.freeze(["fetch", "--quiet", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main"]);

/** @returns {Prepared | null} */
function readPrepared() {
  try {
    const record = JSON.parse(readFileSync(PREPARED_PATH, "utf8"));
    return typeof record?.commit === "string" && typeof record.tag === "string" && typeof record.digest === "string"
      ? { commit: record.commit, tag: record.tag, digest: record.digest }
      : null;
  } catch {
    return null;
  }
}

export const ORIGIN_USAGE =
  "--origin takes the site's own address or this Worker's workers.dev address " +
  "(https://tide-and-tumble.<account subdomain>.workers.dev), nothing else.";

/**
 * Where production is checked: the site's address, which only answers from
 * this Worker while the operator's zone route is attached, or this Worker's
 * own workers.dev address, named with `--origin`. That address is never
 * written into this public repository.
 *
 * @param {Project} project
 * @param {string | undefined} origin
 * @returns {{ url: string, domain: boolean }}
 */
export function checkAddress(project, origin) {
  if (origin === undefined || origin.replace(/\/+$/, "") === project.origin) {
    return { url: project.origin, domain: true };
  }
  const devOrigin = workersDevOrigin(origin, project.worker);
  if (devOrigin === null) {
    throw new Error(ORIGIN_USAGE);
  }
  return { url: devOrigin, domain: false };
}

/**
 * Refuses to go on while a Wrangler configuration other than the committed
 * one could be read: Wrangler prefers a wrangler.json, looking in every
 * directory up from the repository.
 *
 * @param {Tools} tools
 */
function refuseStrayConfigs(tools) {
  const stray = tools.strayConfigs();
  if (stray.length > 0) {
    throw new StepFailed(
      "start: a wrangler.json or wrangler.toml would be read instead of this repository's wrangler.jsonc. " +
        "Move it away",
      stray.join("\n"),
    );
  }
}

/** The real git, npm, Wrangler, files and network. @type {Tools} */
export const realTools = {
  run,
  wrangler,
  say,
  runIn: (dir, command, args) => run(command, args, { cwd: dir }),
  github:
    process.env.GITHUB_ACTIONS === "true"
      ? { ref: process.env.GITHUB_REF ?? "", sha: process.env.GITHUB_SHA ?? "", event: process.env.GITHUB_EVENT_NAME ?? "" }
      : null,
  credentials: () => credentialVariables(process.env),
  buildOutput: (root = ROOT_PATH) => listOutput(join(root, ASSETS_DIR)),
  outDigest: (root = ROOT_PATH) => outDigest(join(root, ASSETS_DIR)),
  missingTables: (root = ROOT_PATH) => pagesWithoutTable(join(root, ASSETS_DIR)),
  clearGenerated: () => rmSync(join(ROOT_PATH, ASSETS_DIR), { recursive: true, force: true }),
  createBuildTree(commit) {
    const parent = mkdtempSync(BUILD_TREE_PREFIX);
    const dir = join(parent, "tree");
    const added = run("git", ["worktree", "add", "--detach", dir, commit]);
    if (!added.ok) {
      rmSync(parent, { recursive: true, force: true });
      throw new StepFailed("make a clean copy of the commit to build", redact(added.output.trim()));
    }
    return dir;
  },
  removeBuildTree(dir) {
    const parent = dirname(dir);
    if (basename(dir) !== "tree" || !parent.startsWith(BUILD_TREE_PREFIX)) {
      throw new Error(`${dir} is not a folder createBuildTree made, so it was not removed`);
    }
    // This worktree only: `git worktree prune` would also drop the records of other worktrees whose folders are gone.
    run("git", ["worktree", "remove", "--force", dir]);
    rmSync(parent, { recursive: true, force: true });
  },
  copyBuild(from) {
    cpSync(join(from, ASSETS_DIR), join(ROOT_PATH, ASSETS_DIR), {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
  },
  prepared: () => readPrepared(),
  writePrepared(record) {
    mkdirSync(dirname(PREPARED_PATH), { recursive: true });
    writeFileSync(PREPARED_PATH, `${JSON.stringify(record)}\n`);
  },
  strayConfigs: () => strayConfigs(),
  answeringVersion: (baseUrl) => answeringVersion(baseUrl, realDeps),
  /** Checks a site and prints the result as one JSON line, labelled with what was checked. */
  async health(check, request) {
    const result = await checkHealth(
      { expectTag: null, expectVersion: null, samples: 20, p95Ms: 300, waitMs: 0, ...request },
      realDeps,
    );
    console.log(redact(JSON.stringify({ check, ...result })));
    return result;
  },
};

/**
 * A deployment's versions and their shares of the traffic, as one line that
 * can be compared: "<id> (100%)", or "<a> (50%), <b> (50%)" while split.
 *
 * @param {Deployment} deployment
 */
function trafficOf(deployment) {
  return [...deployment.versions]
    .sort((a, b) => a.version_id.localeCompare(b.version_id))
    .map((version) => `${version.version_id} (${version.percentage}%)`)
    .join(", ");
}

/**
 * Which version is live right now. `exists` is false for a Worker that has
 * never been deployed; `versionId` is null while traffic is split.
 *
 * @param {Project} project
 * @param {Tools} tools
 * @returns {{ exists: boolean, versionId: string | null, traffic: string }}
 */
function liveVersion(project, tools) {
  const result = tools.wrangler(["deployments", "status", "--name", project.worker, "--json", "--config", project.configPath]);
  if (!result.ok) {
    if (workerDoesNotExist(result.output)) {
      return { exists: false, versionId: null, traffic: "nothing" };
    }
    throw new StepFailed("read the current deployment", redact(result.output.trim()));
  }
  const deployment = /** @type {Deployment} */ (jsonFrom(result));
  return { exists: true, versionId: activeVersionId(deployment), traffic: trafficOf(deployment) };
}

/**
 * The tag a version was uploaded with, or null when it has none.
 *
 * @param {Project} project
 * @param {string} versionId
 * @param {Tools} tools
 * @returns {string | null}
 */
function versionTag(project, versionId, tools) {
  const view = must(
    `read version ${versionId}`,
    tools.wrangler(["versions", "view", versionId, "--name", project.worker, "--json", "--config", project.configPath]),
  );
  const tag = /** @type {{ annotations?: Record<string, unknown> }} */ (jsonFrom(view)).annotations?.["workers/tag"];
  return typeof tag === "string" && tag !== "" ? tag : null;
}

/**
 * The commit a release is made of: GitHub's main, exactly, with nothing else
 * in the working tree. An unpushed or unreviewed commit is refused.
 *
 * @param {Tools} tools
 * @returns {{ commit: string, tag: string, subject: string }}
 */
function releasableCommit(tools) {
  const changes = must("read the git status", tools.run("git", ["status", "--porcelain"])).stdout.trim();
  if (changes !== "") {
    throw new StepFailed("start: commit or stash these changes first, so that a release is exactly one commit", changes);
  }
  // `git status` says nothing about a file marked assume-unchanged or skip-worktree, however it differs from the
  // commit, and Wrangler bundles the Worker from the checkout.
  const hidden = must("read git's index", tools.run("git", ["ls-files", "-v", "-z"]))
    .stdout.split("\0")
    .filter((entry) => entry !== "" && !entry.startsWith("H "));
  if (hidden.length > 0) {
    throw new StepFailed(
      "start from a checkout git fully sees: these files are marked assume-unchanged or skip-worktree, or are " +
        "unmerged, so `git status` would not show a change to them. Clear the marks (git update-index " +
        "--no-assume-unchanged --no-skip-worktree <file>), then start again",
      hidden.join("\n"),
    );
  }

  // Only main's commit is released: the commit main is on, on GitHub.
  const commit = must("read the commit", tools.run("git", ["rev-parse", "HEAD"])).stdout.trim();
  if (tools.github) {
    // deploy.yml checks out the commit main pointed at when the run started, and keeps no credential to fetch with.
    if (tools.github.ref !== "refs/heads/main" || tools.github.sha !== commit) {
      throw new StepFailed(
        `release only main: this run is for ${tools.github.ref} at ${tools.github.sha}, and HEAD is ${commit}`,
      );
    }
  } else {
    must("fetch main from GitHub", tools.run("git", [...FETCH_MAIN]));
    const main = must("read origin/main", tools.run("git", ["rev-parse", "refs/remotes/origin/main"])).stdout.trim();
    if (main !== commit) {
      throw new StepFailed(
        `release only main: HEAD is ${commit}, but GitHub's main (origin/main) is ${main}. Release from a checkout ` +
          "of main that matches GitHub's: git switch --detach origin/main",
      );
    }
  }
  const tag = must("read the commit", tools.run("git", TAG_ARGS)).stdout.trim();
  const subject = must("read the commit", tools.run("git", ["log", "-1", "--format=%s"])).stdout.trim();
  return { commit, tag, subject };
}

/**
 * Refuses a build that holds what must never be uploaded, or nothing.
 *
 * @param {{ files: string[], links: string[] }} output
 */
function checkOutput(output) {
  const stray = [...strayFiles(output.files), ...output.links];
  if (stray.length > 0) {
    throw new StepFailed(
      "check the build: it holds dotfiles, private keys or symbolic links, which must never be uploaded",
      stray.map((path) => `out/${path}`).join("\n"),
    );
  }
  if (output.files.length === 0) {
    throw new StepFailed("check the build: out/ is empty");
  }
}

/**
 * Reads out/ for a check, turning what it must not hold (a symbolic link, say) into a failed step.
 *
 * @template T
 * @param {string} step
 * @param {() => T} read
 * @returns {T}
 */
function readOut(step, read) {
  try {
    return read();
  } catch (error) {
    throw new StepFailed(`${step}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Builds GitHub's main and checks the build with no Cloudflare credential in
 * reach, then records the commit and a digest of out/ for `promote`. The
 * build runs project and dependency code, which could read a token from its
 * own environment.
 *
 * It builds in a clean copy of the commit, a detached worktree in a new
 * temporary folder, so nothing in the working tree but the commit (a file git
 * ignores, a stale out/ or node_modules/) can reach the build or the upload.
 * Dependencies are installed with their install scripts off. The checked
 * out/ is copied into the checkout, where `promote` uploads it, and the
 * worktree is removed.
 *
 * @param {Project} project
 * @param {Tools} tools
 * @returns {Promise<{ ok: true } & Prepared>}
 */
export async function prepareRelease(project, tools) {
  const credentials = tools.credentials();
  if (credentials.length > 0) {
    throw new StepFailed(
      `prepare without Cloudflare credentials: ${credentials.join(", ")} ${credentials.length === 1 ? "is" : "are"} ` +
        "set. The build runs project and dependency code, which can read any credential in its environment; give " +
        "the token to `npm run promote` only",
    );
  }
  refuseStrayConfigs(tools);
  const { commit, tag } = releasableCommit(tools);
  // Mode 120000 is a symbolic link: checked out, a build that follows one could copy any file on this machine.
  const links = must("list the commit's files", tools.run("git", ["ls-tree", "-r", "-z", "--full-tree", commit]))
    .stdout.split("\0")
    .filter((entry) => entry.startsWith("120000 "))
    .map((entry) => entry.slice(entry.indexOf("\t") + 1));
  if (links.length > 0) {
    throw new StepFailed(
      "prepare without symbolic links: these files in the commit are links, and a build that follows one could " +
        "copy whatever it points to. Commit the files themselves",
      links.join("\n"),
    );
  }

  // Nothing generated by an earlier build may reach this one.
  tools.clearGenerated();
  const tree = tools.createBuildTree(commit);
  /** @type {string} */
  let digest;
  try {
    tools.say(`prepare-release: building ${tag} in a clean copy of the commit, with install scripts off`);
    must("install the locked dependencies (npm ci --ignore-scripts)", tools.runIn(tree, "npm", ["ci", "--ignore-scripts"]));
    tools.say(`prepare-release: verifying ${tag} (types, lint, tests, the export and its check)`);
    must("verify the release (npm run verify)", tools.runIn(tree, "npm", ["run", "verify"]));
    checkOutput(readOut("check the build", () => tools.buildOutput(tree)));
    digest = readOut("check the build", () => tools.outDigest(tree));
    tools.copyBuild(tree);
  } finally {
    tools.removeBuildTree(tree);
  }
  if (readOut("check out/", () => tools.outDigest()) !== digest) {
    throw new StepFailed(
      "copy the checked build into out/: the copy is not exactly the build that was checked. Run prepare-release again",
    );
  }
  // promote runs this checkout's Wrangler: the locked version, installed afresh.
  tools.say("prepare-release: installing the locked dependencies here too, for the Wrangler promote runs");
  must("install the locked dependencies for promote (npm ci --ignore-scripts)", tools.run("npm", ["ci", "--ignore-scripts"]));

  const record = { commit, tag, digest };
  tools.writePrepared(record);
  tools.say(`prepare-release: ${tag} is ready; release it with npm run promote`);
  return { ok: true, ...record };
}

/**
 * Why a nightly refresh must change nothing, or null when it may go ahead: it
 * only rebuilds the release production already runs, so it never advances
 * production, and never undoes a rollback.
 *
 * @param {Project} project
 * @param {{ exists: boolean, versionId: string | null }} live
 * @param {string} tag This commit's tag.
 * @param {Tools} tools
 * @returns {string | null}
 */
function refreshRefusal(project, live, tag, tools) {
  if (!live.exists) {
    return "nothing is live yet, and a nightly refresh only rebuilds the release production runs";
  }
  if (live.versionId === null) {
    return "traffic is split between versions, and a nightly refresh only rebuilds the release production runs";
  }
  const liveTag = versionTag(project, live.versionId, tools);
  if (liveTag !== tag) {
    return (
      `production runs ${liveTag ?? "a version with no tag"}, not main's head ${tag}: a rollback or a failed release ` +
      "is in place. A nightly refresh only rebuilds what production runs, so nothing was released. A push to main, " +
      "or Deploy run by hand, releases main's head"
    );
  }
  return null;
}

/**
 * Is the address being checked served by this Worker, in the account Wrangler
 * acts on? At the site's own address it must answer with the live version:
 * otherwise the zone route is not attached (or production cannot answer), and
 * a check there would fail a healthy release and roll it back. At workers.dev
 * the version it answers with must be one Wrangler can find for this Worker,
 * which it only can in the right account. Throws when it is not; resolves
 * `confirmed: false` when workers.dev cannot say (production down).
 *
 * @param {Project} project
 * @param {{ url: string, domain: boolean }} at
 * @param {string | null} liveVersionId
 * @param {Tools} tools
 * @returns {Promise<{ confirmed: boolean, detail: string }>}
 */
async function confirmAddress(project, at, liveVersionId, tools) {
  const answer = await tools.answeringVersion(at.url);
  if (at.domain) {
    if (answer.versionId === null || answer.versionId !== liveVersionId) {
      const said =
        answer.versionId === null
          ? `did not say which version answers (${answer.detail})`
          : `answers with version ${answer.versionId}, not the live ${liveVersionId ?? "split deployment"}`;
      throw new StepFailed(
        `confirm production: ${at.url} ${said}, so it is not served by this Worker's live version: the zone route ` +
          "is not attached, or production cannot answer. Nothing was changed. Check the Worker on its own address " +
          "instead: --origin https://tide-and-tumble.<account subdomain>.workers.dev",
      );
    }
    return { confirmed: true, detail: answer.detail };
  }
  if (answer.versionId === null) {
    return { confirmed: false, detail: answer.detail };
  }
  // It goes on Wrangler's command line below: only a version id, never text that reads as a flag.
  if (!VERSION_ID.test(answer.versionId)) {
    return { confirmed: false, detail: "it answered with a version id that is not a Cloudflare version id" };
  }
  const known = tools.wrangler([
    "versions",
    "view",
    answer.versionId,
    "--name",
    project.worker,
    "--json",
    "--config",
    project.configPath,
  ]);
  if (!known.ok) {
    throw new StepFailed(
      `confirm the account: ${at.url} answers with version ${answer.versionId}, but Wrangler cannot find ` +
        `version ${answer.versionId} of the Worker ${project.worker}. It is signed in to another account ` +
        "(npx wrangler whoami shows which), the address is another account's, or the Cloudflare API failed " +
        "(its answer is below). Nothing was changed",
      redact(known.output.trim()),
    );
  }
  return { confirmed: true, detail: answer.detail };
}

/**
 * What to say when nobody knows whether production is healthy: which version
 * may be serving, and the exact commands to check it and to go back.
 *
 * @param {string} checkedAt
 * @param {string} versionId The version that may be live.
 * @param {string} tag Its tag.
 * @param {string | null} previousVersionId Where to go back to, if known.
 */
function unchecked(checkedAt, versionId, tag, previousVersionId) {
  const back = previousVersionId ?? "<versionId> (npx wrangler versions list shows them)";
  return (
    `version ${versionId} may be live and unchecked. Check it: npm run health -- ${checkedAt} --expect-tag ${tag}. ` +
    `Go back: npm run rollback -- ${back}`
  );
}

/**
 * Runs a health check and never throws: a check that breaks is a failed
 * check, so the caller still rolls back or reports.
 *
 * @param {Tools} tools
 * @param {string} check
 * @param {HealthRequest} request
 * @returns {Promise<HealthResult>}
 */
async function checkSafely(tools, check, request) {
  try {
    return await tools.health(check, request);
  } catch (error) {
    return {
      ok: false,
      blocked: false,
      url: request.baseUrl,
      tag: null,
      versionId: null,
      samples: 0,
      p95Ms: null,
      limitMs: 0,
      failures: [`the ${check} check itself failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Sends all traffic to `versionId` and checks production once it has.
 *
 * @param {Project} project
 * @param {string} versionId
 * @param {string} reason Recorded with the deployment.
 * @param {Tools} tools
 * @param {string} checkAt
 */
async function rollBackTo(project, versionId, reason, tools, checkAt) {
  tools.say(`rollback: sending all traffic to version ${versionId}`);
  must(
    `roll back to version ${versionId}`,
    tools.wrangler([
      "rollback",
      versionId,
      "--name",
      project.worker,
      "--message",
      reason,
      "--yes",
      "--config",
      project.configPath,
    ]),
  );
  return checkSafely(tools, "rollback", { baseUrl: checkAt, expectVersion: versionId, waitMs: SETTLE_MS });
}

/**
 * Releases the current commit. Resolves with a summary when production is
 * healthy on the new version; throws `StepFailed` otherwise, having put the
 * previous version back if production had already been changed.
 *
 * @param {Project} project
 * @param {Tools} tools
 * @param {{ origin?: string }} [options] Where production is checked (`checkAddress`).
 * @returns {Promise<{ ok: true, released: true, tag: string, versionId: string | null, previousVersionId: string | null, url: string, p95Ms: number | null } | { ok: true, released: false, tag: string, reason: string, url: string }>}
 */
export async function promote(project, tools, { origin } = {}) {
  refuseStrayConfigs(tools);
  const at = checkAddress(project, origin);
  // A scheduled run only refreshes what production runs (refreshRefusal).
  const refresh = tools.github?.event === "schedule";
  const { commit, tag, subject } = releasableCommit(tools);
  const message = `${refresh ? `${NIGHTLY_REFRESH} ` : ""}${tag} ${subject}`.slice(0, 100);
  tools.say(
    `promote: ${refresh ? "refreshing" : "releasing"} ${tag}, checked at ` +
      `${at.domain ? at.url : "the Worker's workers.dev address"}`,
  );

  // No build here: promote holds the token, so the build ran before it, in prepare-release, and out/ must still be
  // exactly what was checked there.
  const prepared = tools.prepared();
  if (prepared === null || prepared.commit !== commit) {
    throw new StepFailed(
      `find the prepared build of ${tag}: run \`node scripts/prepare-release.mjs\` first, with no Cloudflare ` +
        "credential in its environment (docs/DELIVERY.md)",
    );
  }
  checkOutput(readOut("check out/", () => tools.buildOutput()));
  if (readOut("check out/", () => tools.outDigest()) !== prepared.digest) {
    throw new StepFailed("check out/: it changed after prepare-release built and checked it. Run prepare-release again");
  }
  if (refresh) {
    const missing = readOut("check out/", () => tools.missingTables());
    if (missing.length > 0) {
      throw new StepFailed(
        `refresh: ${missing.length} beach ${missing.length === 1 ? "page was" : "pages were"} built without their ` +
          "tide table (NOAA did not answer the build), so this build is not released; production keeps the tables " +
          "it has",
        missing.join("\n"),
      );
    }
  }

  const before = liveVersion(project, tools);

  if (refresh) {
    const refusal = refreshRefusal(project, before, tag, tools);
    if (refusal !== null) {
      tools.say(`promote: ${refusal}`);
      return { ok: true, released: false, tag, reason: refusal, url: at.url };
    }
  }

  if (!before.exists) {
    // `wrangler versions upload` refuses a Worker that does not exist yet, so the first release is a plain deploy,
    // which creates it. Nothing is live before it, so there is nothing to protect or restore.
    if (at.domain) {
      throw new StepFailed(
        `release the first version: the Worker does not exist yet, so ${at.url} cannot be serving it. Release with ` +
          "--origin https://tide-and-tumble.<account subdomain>.workers.dev. Nothing was changed",
      );
    }
    tools.say("promote: first release of this Worker; creating it");
    must("create and deploy the Worker", tools.wrangler(["deploy", "--tag", tag, "--message", message, "--config", project.configPath]));
    const first = await checkSafely(tools, "production", {
      baseUrl: at.url,
      expectTag: tag,
      // A brand-new workers.dev address takes longer to start answering.
      waitMs: 2 * SETTLE_MS,
    });
    if (first.blocked) {
      throw new StepFailed(
        `check the first release: Cloudflare's bot protection blocked the check, and there is no earlier version to ` +
          `roll back to. Check it from another network: npm run health -- <address> --expect-tag ${tag}`,
      );
    }
    if (!first.ok) {
      throw new StepFailed("pass the health check after the first release; there is no earlier version to roll back to");
    }
    return {
      ok: true,
      released: true,
      tag,
      versionId: first.versionId,
      previousVersionId: null,
      url: at.url,
      p95Ms: first.p95Ms,
    };
  }

  // Before anything changes: the address that will be checked is served by this Worker, in this account.
  const confirmed = await confirmAddress(project, at, before.versionId, tools);
  if (!confirmed.confirmed) {
    tools.say(
      `promote: the workers.dev address did not say which version answers (${confirmed.detail}), so the account is ` +
        "not confirmed before the release; production's own check after it would fail in another account",
    );
  }

  tools.say("promote: uploading a new version");
  const upload = parseVersionUpload(
    must(
      "upload the new version",
      tools.wrangler(["versions", "upload", "--tag", tag, "--message", message, "--config", project.configPath]),
    ).output,
  );
  // Wrangler has read out/ for the upload: it must still be exactly what prepare-release checked, or the version
  // may hold something else.
  if (readOut("check out/ after the upload", () => tools.outDigest()) !== prepared.digest) {
    throw new StepFailed(
      `check out/ after the upload: it changed while version ${upload.versionId} was uploading, so that version may ` +
        "not be what prepare-release checked; production was not changed. Run prepare-release again",
    );
  }
  if (upload.previewUrl) {
    // The address itself is not printed: it carries the account's workers.dev subdomain.
    throw new StepFailed(
      `send traffic to version ${upload.versionId}: Wrangler named an address for it, so Version URLs are on in ` +
        "Cloudflare although wrangler.jsonc turns them off (design note, D3), and every version answers at an address of " +
        "its own. Production was not changed. Turn Preview URLs off in the dashboard (the Worker's Settings, Domains " +
        "& Routes), then release again",
    );
  }

  // Releases are queued on GitHub, but one from a workstation is not: if production changed since this run
  // read it, another release is under way, and this one stops rather than undo it.
  const beforeDeploy = liveVersion(project, tools);
  if (beforeDeploy.traffic !== before.traffic) {
    throw new StepFailed(
      `send traffic to version ${upload.versionId}: production changed while this release ran ` +
        `(from ${before.traffic} to ${beforeDeploy.traffic}), so another release may be under way. ` +
        "This release did not change production",
    );
  }

  tools.say("promote: sending all traffic to the new version");
  const deployed = tools.wrangler([
    "versions",
    "deploy",
    `${upload.versionId}@100%`,
    "--name",
    project.worker,
    "--message",
    message,
    "--yes",
    "--config",
    project.configPath,
  ]);
  if (!deployed.ok) {
    // Wrangler can fail after Cloudflare took the change (a timeout, say), so ask what is live rather than assume.
    const details = redact(deployed.output.trim());
    let now;
    try {
      now = liveVersion(project, tools);
    } catch {
      throw new StepFailed(
        "deploy the new version: Wrangler reported a failure and the live version could not be read, so " +
          unchecked(at.url, upload.versionId, tag, before.versionId),
        details,
      );
    }
    if (now.versionId !== upload.versionId) {
      throw new StepFailed(`deploy the new version; production is still on ${now.traffic}`, details);
    }
    tools.say("promote: Wrangler reported a failure, but the new version is live; checking production");
  }

  // Version URLs are off, so production is the new version's first check (design note, D3). It must answer with
  // this version, not only this tag: a nightly refresh uploads the same commit again, under the same tag.
  const expected = { baseUrl: at.url, expectTag: tag, expectVersion: upload.versionId, waitMs: SETTLE_MS };
  let production = await checkSafely(tools, "production", expected);
  if (production.blocked) {
    // A blocked check says nothing about health, so it never causes a rollback.
    throw new StepFailed(
      `check production: Cloudflare's bot protection blocked the check of ${at.url}, so ` +
        unchecked(at.url, upload.versionId, tag, before.versionId),
    );
  }
  if (!production.ok) {
    // One bad answer, such as a 502 among the timed samples, fails the check of a healthy release, and a rollback
    // undoes it: check once more first.
    tools.say(`promote: production failed its check at ${at.url}; checking once more before rolling back`);
    production = await checkSafely(tools, "production", expected);
    if (production.blocked) {
      throw new StepFailed(
        `check production: it failed its check at ${at.url}, and Cloudflare's bot protection blocked the second ` +
          `check, so ${unchecked(at.url, upload.versionId, tag, before.versionId)}`,
      );
    }
  }
  if (!production.ok) {
    if (before.versionId === null) {
      throw new StepFailed(
        "pass the health check on production. Traffic was split between versions before this release, " +
          "so it was not rolled back automatically: run `npm run rollback -- <versionId>`",
      );
    }
    // Roll back only this run's version: another release or rollback may have changed production since.
    let current;
    try {
      current = liveVersion(project, tools);
    } catch {
      throw new StepFailed(
        "roll back: production failed its check, and the live version could not be read, so nothing was rolled back: " +
          unchecked(at.url, upload.versionId, tag, before.versionId),
      );
    }
    if (current.versionId !== upload.versionId) {
      throw new StepFailed(
        `roll back: production failed its check, but it is no longer on this release's version ${upload.versionId} ` +
          `(now ${current.traffic}): another release or rollback changed it, so nothing was rolled back. ` +
          `Check it: npm run health -- ${at.url}`,
      );
    }
    tools.say("promote: production is not healthy; rolling back");
    let back;
    try {
      back = await rollBackTo(project, before.versionId, `Automatic rollback: ${tag} failed its health check`, tools, at.url);
    } catch (error) {
      throw new StepFailed(
        `roll back: production failed its check, and the automatic rollback to version ${before.versionId} failed, so ` +
          unchecked(at.url, upload.versionId, tag, before.versionId),
        error instanceof StepFailed ? error.details : String(error),
      );
    }
    if (back.blocked) {
      throw new StepFailed(
        `pass the health check on production; rolled back to version ${before.versionId}, but Cloudflare's bot ` +
          "protection blocked the check of the rollback, so it is unconfirmed. Check it from another network: " +
          `npm run health -- ${at.url} --expect-version ${before.versionId}`,
      );
    }
    if (!back.ok) {
      throw new StepFailed(
        `pass the health check on production; rolled back to version ${before.versionId}, and production is still ` +
          "not healthy. Choose a version you trust (npx wrangler versions list) and run npm run rollback -- <versionId>",
      );
    }
    throw new StepFailed(`pass the health check on production; rolled back to version ${before.versionId}`);
  }

  return {
    ok: true,
    released: true,
    tag,
    versionId: upload.versionId,
    previousVersionId: before.versionId,
    url: at.url,
    p95Ms: production.p95Ms,
  };
}

/**
 * The newest version, among the recent deployments, of a commit other than the
 * live one: going back past the nightly refreshes of the live commit, which
 * carry its tag. With no tag on the live version, the version live before it.
 *
 * @param {Project} project
 * @param {Deployment[]} history
 * @param {string} liveVersionId
 * @param {Tools} tools
 * @returns {string | null}
 */
function earlierRelease(project, history, liveVersionId, tools) {
  const liveTag = versionTag(project, liveVersionId, tools);
  if (liveTag === null) {
    return previousVersionId(history, liveVersionId);
  }
  const newestFirst = [...history].sort((a, b) => b.created_on.localeCompare(a.created_on));
  /** @type {Set<string>} */
  const seen = new Set([liveVersionId]);
  for (const deployment of newestFirst) {
    const versionId = activeVersionId(deployment);
    if (versionId === null || seen.has(versionId)) continue;
    seen.add(versionId);
    if (versionTag(project, versionId, tools) !== liveTag) {
      return versionId;
    }
  }
  return null;
}

/**
 * Sends all traffic back to an earlier version and checks production.
 * Without `requested`, that is the newest version of an earlier commit than
 * the live one (`earlierRelease`). Resolves with a summary whose `ok` says whether production is healthy;
 * `blocked` is true when Cloudflare's bot protection blocked the check, so the
 * rollback is unconfirmed rather than unhealthy.
 *
 * @param {Project} project
 * @param {string | undefined} requested A Worker version id.
 * @param {Tools} tools
 * @param {{ origin?: string }} [options] Where production is checked (`checkAddress`).
 * @returns {Promise<{ ok: boolean, blocked: boolean, versionId: string, tag: string | null, replacedVersionId: string | null, url: string }>}
 */
export async function rollback(project, requested, tools, { origin } = {}) {
  if (requested !== undefined && !VERSION_ID.test(requested)) {
    throw new Error(
      "Usage: npm run rollback -- [versionId] [--origin <address>]\n" +
        "  versionId is a Worker version id, as `npx wrangler versions list` prints it.",
    );
  }

  refuseStrayConfigs(tools);
  const at = checkAddress(project, origin);
  const live = liveVersion(project, tools);
  if (!live.exists) {
    throw new StepFailed("roll back: this Worker has never been deployed");
  }

  /** @type {string | null} */
  let target = requested ?? null;
  if (target === null && live.versionId !== null) {
    const history = /** @type {Deployment[]} */ (
      jsonFrom(
        must(
          "list past deployments",
          tools.wrangler(["deployments", "list", "--name", project.worker, "--json", "--config", project.configPath]),
        ),
      )
    );
    target = earlierRelease(project, history, live.versionId, tools);
  }
  if (target === null) {
    throw new StepFailed(
      "choose a version: none of the recent deployments ran an earlier commit than the live one. Name one " +
        "(npx wrangler versions list --config wrangler.jsonc shows them): npm run rollback -- <versionId>",
    );
  }
  if (target === live.versionId) {
    throw new StepFailed(`roll back: version ${target} is already the live one`);
  }

  // A rollback changes production at once, so the address and the account are confirmed first, as promote does.
  const handCommands =
    `If npx wrangler whoami shows the right account, roll back by hand: npx wrangler rollback ${target} ` +
    `--name ${project.worker} --config wrangler.jsonc, then check: npm run health -- <address> --expect-version ${target}`;
  let confirmed;
  try {
    confirmed = await confirmAddress(project, at, live.versionId, tools);
  } catch (error) {
    if (error instanceof StepFailed) {
      throw new StepFailed(`${error.message.replace(/^Failed to /, "").replace(/\.$/, "")}. ${handCommands}`, error.details);
    }
    throw error;
  }
  if (!confirmed.confirmed) {
    throw new StepFailed(
      `confirm the account: the workers.dev address did not say which version answers (${confirmed.detail}), so ` +
        `nothing shows that Wrangler is signed in to the account that serves it. ${handCommands}`,
    );
  }

  const result = await rollBackTo(
    project,
    target,
    `Manual rollback from ${live.versionId ?? "a split deployment"}`,
    tools,
    at.url,
  );
  if (result.blocked) {
    tools.say(
      `rollback: Cloudflare's bot protection blocked the check of ${at.url}, so the rollback is unconfirmed. ` +
        `Check it from another network: npm run health -- ${at.url} --expect-version ${target}`,
    );
  }
  return {
    ok: result.ok,
    blocked: result.blocked,
    versionId: target,
    tag: result.tag,
    replacedVersionId: live.versionId,
    url: at.url,
  };
}
