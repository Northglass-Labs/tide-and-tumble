import { fileURLToPath } from "node:url";
import { listOutput, strayFiles } from "./build-output.mjs";
import { answeringVersion, checkHealth, realDeps, VERSION_ID } from "./health-check.mjs";
import { ASSETS_DIR, ROOT, strayConfigs } from "./project.mjs";
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
 * The release flow behind `npm run promote` and `npm run rollback`, from the
 * app template's reviewed scripts, changed for this app: no database, Version
 * URLs off (design note, D3), and production checked where the operator says it is
 * served (docs/DELIVERY.md, "Where production is checked").
 *
 * Everything that touches the outside world (git, npm, Wrangler, the
 * network) comes in through `tools`, so the order of steps and what happens
 * when one fails is tested with stand-ins (test/scripts/release.test.ts).
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
 * @typedef {object} Tools
 * @property {(command: string, args: string[]) => RunResult} run
 * @property {(args: string[]) => RunResult} wrangler
 * @property {(check: string, request: HealthRequest) => Promise<HealthResult>} health
 * @property {(line: string) => void} say
 * @property {{ ref: string, sha: string } | null} github On GitHub Actions, the ref and commit
 *   GitHub says the run is for; null anywhere else.
 * @property {() => { files: string[], links: string[] }} buildOutput What is in out/, relative to it.
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

/** The real git, npm, Wrangler and network. @type {Tools} */
export const realTools = {
  run,
  wrangler,
  say,
  github:
    process.env.GITHUB_ACTIONS === "true"
      ? { ref: process.env.GITHUB_REF ?? "", sha: process.env.GITHUB_SHA ?? "" }
      : null,
  buildOutput: () => listOutput(fileURLToPath(new URL(`${ASSETS_DIR}/`, ROOT))),
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
 * @returns {Promise<{ ok: true, tag: string, versionId: string | null, previousVersionId: string | null, url: string, p95Ms: number | null }>}
 */
export async function promote(project, tools, { origin } = {}) {
  refuseStrayConfigs(tools);
  const at = checkAddress(project, origin);
  const changes = must("read the git status", tools.run("git", ["status", "--porcelain"])).stdout.trim();
  if (changes !== "") {
    throw new StepFailed("start: commit or stash these changes first, so that a release is exactly one commit", changes);
  }

  // Only main's commit is released: the commit main is on, on GitHub.
  const head = must("read the commit", tools.run("git", ["rev-parse", "HEAD"])).stdout.trim();
  if (tools.github) {
    // deploy.yml checks out the commit main pointed at when the run started,
    // and keeps no credential to fetch with.
    if (tools.github.ref !== "refs/heads/main" || tools.github.sha !== head) {
      throw new StepFailed(
        `release only main: this run is for ${tools.github.ref} at ${tools.github.sha}, and HEAD is ${head}`,
      );
    }
  } else {
    must("fetch main from origin, to compare it with this commit", tools.run("git", ["fetch", "--quiet", "origin", "main"]));
    const main = must("read origin/main", tools.run("git", ["rev-parse", "origin/main"])).stdout.trim();
    if (main !== head) {
      throw new StepFailed(
        `release only main: HEAD is ${head}, but origin/main is ${main}. Release from a checkout of main that matches GitHub's`,
      );
    }
  }

  const tag = must("read the commit", tools.run("git", TAG_ARGS)).stdout.trim();
  const subject = must("read the commit", tools.run("git", ["log", "-1", "--format=%s"])).stdout.trim();
  const message = `${tag} ${subject}`.slice(0, 100);
  tools.say(`promote: releasing ${tag}, checked at ${at.domain ? at.url : "the Worker's workers.dev address"}`);

  // The build uses exactly what the lockfile lists, whatever node_modules held before.
  tools.say("promote: installing the dependencies from package-lock.json");
  must("install exactly what package-lock.json lists (npm ci)", tools.run("npm", ["ci"]));

  tools.say("promote: building the static export");
  must("build", tools.run("npm", ["run", "build"]));
  const output = tools.buildOutput();
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

  const before = liveVersion(project, tools);

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
    return { ok: true, tag, versionId: first.versionId, previousVersionId: null, url: at.url, p95Ms: first.p95Ms };
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

  // Version URLs are off, so production is the new version's first check (design note, D3).
  let production = await checkSafely(tools, "production", { baseUrl: at.url, expectTag: tag, waitMs: SETTLE_MS });
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
    production = await checkSafely(tools, "production", { baseUrl: at.url, expectTag: tag, waitMs: SETTLE_MS });
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
    tag,
    versionId: upload.versionId,
    previousVersionId: before.versionId,
    url: at.url,
    p95Ms: production.p95Ms,
  };
}

/**
 * Sends all traffic back to an earlier version and checks production.
 * Without `requested`, that is the version that was live before the current
 * one. Resolves with a summary whose `ok` says whether production is healthy;
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
    target = previousVersionId(history, live.versionId);
  }
  if (target === null) {
    throw new StepFailed("choose a version: no earlier version was found. Name one: npm run rollback -- <versionId>");
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
