/**
 * Reading what Wrangler prints. Each function is pure and is tested against
 * output captured from a real run (test/scripts/wrangler-output.test.ts), so
 * a Wrangler upgrade that changes its wording fails a test, not a release.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * What `wrangler versions upload` printed: the id of the new version and,
 * when version addresses are on in Cloudflare, the address where it answers.
 * This app turns them off (ADR-006), so an address means they are on anyway.
 *
 * @param {string} output
 * @returns {{ versionId: string, previewUrl: string | null }}
 */
export function parseVersionUpload(output) {
  const versionId = new RegExp(`Version ID:\\s*(${UUID})`, "i").exec(output)?.[1];
  if (!versionId) {
    throw new Error("Could not find a version id in the output of `wrangler versions upload`.");
  }
  const previewUrl = /(?:Preview|Version) URL:\s*(https:\/\/\S+)/i.exec(output)?.[1] ?? null;
  return { versionId, previewUrl };
}

/**
 * `url` as the origin of this Worker's own workers.dev address
 * (`https://<worker>.<account subdomain>.workers.dev`), or null for anything
 * else. The address is never written into this public repository: whoever
 * releases names it with `--origin`.
 *
 * @param {string} url
 * @param {string} worker
 * @returns {string | null}
 */
export function workersDevOrigin(url, worker) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = /^([a-z0-9-]+)\.([a-z0-9-]+)\.workers\.dev$/.exec(parsed.host);
  const bare =
    (parsed.pathname === "/" || parsed.pathname === "") &&
    parsed.search === "" &&
    parsed.hash === "" &&
    parsed.username === "" &&
    parsed.password === "";
  return parsed.protocol === "https:" && bare && match && match[1] === worker ? parsed.origin : null;
}

/**
 * Whether Wrangler is saying the Worker has never been deployed. The first
 * release of a new app must then use `wrangler deploy`, which creates it.
 *
 * @param {string} output
 * @returns {boolean}
 */
export function workerDoesNotExist(output) {
  return /\[code: 10007\]/.test(output) || /This Worker does not exist/i.test(output);
}

/**
 * One entry of `wrangler deployments list --json`, which is also what
 * `wrangler deployments status --json` prints.
 *
 * @typedef {object} Deployment
 * @property {string} created_on
 * @property {{ version_id: string, percentage: number }[]} versions
 */

/**
 * The version a deployment sends all traffic to, or null while traffic is
 * split between versions.
 *
 * @param {Deployment} deployment
 * @returns {string | null}
 */
export function activeVersionId(deployment) {
  return deployment.versions.find((version) => version.percentage === 100)?.version_id ?? null;
}

/**
 * The version that was live before `currentVersionId` took over: where a
 * rollback without a named version goes. Null if nothing else was ever live.
 *
 * @param {Deployment[]} deployments in any order
 * @param {string} currentVersionId
 * @returns {string | null}
 */
export function previousVersionId(deployments, currentVersionId) {
  const newestFirst = [...deployments].sort((a, b) => b.created_on.localeCompare(a.created_on));
  for (const deployment of newestFirst) {
    const versionId = activeVersionId(deployment);
    if (versionId !== null && versionId !== currentVersionId) {
      return versionId;
    }
  }
  return null;
}

/**
 * Wrangler prints the deploying person's email address in places, and
 * account ids and the account's workers.dev subdomain in others. Anything of
 * Wrangler's or of a site's that these scripts echo goes through this first:
 * this repository is public, and so are its Actions logs (ADR-007).
 *
 * @param {string} text
 * @returns {string}
 */
export function redact(text) {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b([a-z0-9-]+)\.[a-z0-9-]+\.workers\.dev\b/gi, "$1.[subdomain].workers.dev")
    .replace(/\b[0-9a-f]{32}\b/gi, "[account id]");
}
