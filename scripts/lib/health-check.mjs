import { p95 } from "./p95.mjs";

/** A Cloudflare Worker version id: a UUID, as Wrangler prints them. */
export const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const USAGE =
  "Usage: npm run health -- <baseUrl> [--expect-tag <sha>] [--samples 20] [--p95-ms 300]\n" +
  "       also: [--expect-version <id>] [--wait-ms <ms>]";

/** What every page of this site carries, so a check knows the page is this app's. */
export const PAGE_MARKER = '<meta name="application-name" content="Tide &amp; Tumble"/>';

/** A path that is never a page, so it must be the 404 page with status 404. */
export const NOT_A_PAGE = "/health-check-not-a-page";

/**
 * The data API request the check makes: a curated station's tides, which
 * NOAA always predicts. At the site's address it must answer a table, or
 * pass on NOAA's outage (502 upstream_unavailable), which is not the
 * release's fault. At workers.dev the data routes never answer: 404.
 */
export const TIDES_CHECK = "/api/tides?station=8651370";

/** The data API serves the site's own pages, so the check asks as a page on the site does. */
const SAME_ORIGIN = Object.freeze({ "Sec-Fetch-Site": "same-origin" });

/**
 * @typedef {object} HealthOptions
 * @property {string} baseUrl       Address of the site, without a trailing slash.
 * @property {string | null} expectTag      The git commit that should be answering.
 * @property {string | null} expectVersion  The Worker version id that should be answering.
 * @property {number} samples       Timed requests to /api/health.
 * @property {number} p95Ms         Their 95th percentile must be under this.
 * @property {number} waitMs        How long to keep retrying the first check; a new
 *                                  release takes a few seconds to reach every location.
 */

/**
 * @typedef {object} HealthResult
 * @property {boolean} ok
 * @property {boolean} blocked         Cloudflare's bot protection answered with a challenge instead of
 *                                     the site: the check was blocked, which says nothing about health.
 * @property {string} url
 * @property {string | null} tag        The tag the site reported.
 * @property {string | null} versionId  The version id the site reported.
 * @property {number} samples
 * @property {number | null} p95Ms      Null when the samples were not taken.
 * @property {number} limitMs
 * @property {string[]} failures        One sentence per thing that is wrong.
 */

/**
 * @typedef {object} HealthDeps
 * @property {(url: string, init?: { headers?: Record<string, string> }) => Promise<Response>} fetch
 * @property {() => number} now     Milliseconds, from any starting point.
 * @property {(ms: number) => Promise<void>} sleep
 */

/**
 * @param {string} name
 * @param {string | undefined} value
 * @param {number} minimum
 */
function wholeNumber(name, value, minimum) {
  const number = Number(value);
  if (value === undefined || !Number.isInteger(number) || number < minimum) {
    throw new Error(`${name} needs a whole number of at least ${minimum}.\n${USAGE}`);
  }
  return number;
}

/**
 * @param {string[]} argv The arguments after the script name.
 * @returns {HealthOptions}
 */
export function parseHealthArgs(argv) {
  const [first, ...rest] = argv;
  if (!first || !/^https?:\/\/[^\s/]+/.test(first)) {
    throw new Error(USAGE);
  }

  /** @type {HealthOptions} */
  const options = {
    baseUrl: first.replace(/\/+$/, ""),
    expectTag: null,
    expectVersion: null,
    samples: 20,
    p95Ms: 300,
    waitMs: 0,
  };

  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    switch (name) {
      case "--expect-tag":
      case "--expect-version":
        if (!value) {
          throw new Error(`${name} needs a value.\n${USAGE}`);
        }
        options[name === "--expect-tag" ? "expectTag" : "expectVersion"] = value;
        break;
      case "--samples":
        options.samples = wholeNumber(name, value, 1);
        break;
      case "--p95-ms":
        options.p95Ms = wholeNumber(name, value, 1);
        break;
      case "--wait-ms":
        options.waitMs = wholeNumber(name, value, 0);
        break;
      default:
        throw new Error(`Unknown option ${name}.\n${USAGE}`);
    }
  }
  return options;
}

/** How long to pause between attempts while waiting for a release to arrive. */
const RETRY_MS = 2000;

/**
 * Did Cloudflare answer with a challenge page instead of the site? Bot Fight
 * Mode does that to clients it takes for bots, GitHub's runners among them.
 * Cloudflare marks every challenge page with `cf-mitigated: challenge`.
 *
 * @param {Response} response
 */
const challenged = (response) => response.headers.get("cf-mitigated") === "challenge";

/** @param {string} path */
const blockedSentence = (path) =>
  `${path} was challenged by Cloudflare's bot protection (cf-mitigated: challenge): the check was blocked, so it says nothing about the site's health`;

/**
 * Asks /api/health once.
 *
 * @param {HealthOptions} options
 * @param {HealthDeps} deps
 * @returns {Promise<{ failures: string[], blocked: boolean, tag: string | null, versionId: string | null }>}
 */
async function probe(options, deps) {
  /** @type {{ failures: string[], blocked: boolean, tag: string | null, versionId: string | null }} */
  const result = { failures: [], blocked: false, tag: null, versionId: null };

  let response;
  try {
    response = await deps.fetch(`${options.baseUrl}/api/health`);
  } catch (error) {
    result.failures.push(`/api/health could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
  if (challenged(response)) {
    await response.body?.cancel();
    result.blocked = true;
    result.failures.push(blockedSentence("/api/health"));
    return result;
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    result.failures.push(`/api/health answered ${response.status}, not 200`);
    return result;
  }

  /** @typedef {{ ok?: unknown, version?: { id?: unknown, tag?: unknown } }} HealthBody */
  /** @type {HealthBody} */
  let body;
  try {
    body = /** @type {HealthBody} */ (await response.json());
  } catch {
    result.failures.push("/api/health did not answer with JSON");
    return result;
  }
  result.tag = typeof body.version?.tag === "string" ? body.version.tag : null;
  result.versionId = typeof body.version?.id === "string" ? body.version.id : null;

  if (body.ok !== true) {
    result.failures.push(`/api/health reported ok: ${JSON.stringify(body.ok)}`);
  }
  if (options.expectTag !== null && result.tag !== options.expectTag) {
    result.failures.push(`expected tag "${options.expectTag}" but "${result.tag}" is answering`);
  }
  if (options.expectVersion !== null && result.versionId !== options.expectVersion) {
    result.failures.push(`expected version "${options.expectVersion}" but "${result.versionId}" is answering`);
  }
  return result;
}

/**
 * Is the page at `/` this app's, served with its security headers? Is an
 * unknown path a real 404? The static files and `_headers` are uploaded
 * with each version, so a release that lost them fails here.
 *
 * @param {HealthOptions} options
 * @param {HealthDeps} deps
 * @returns {Promise<{ failures: string[], blocked: boolean }>}
 */
async function checkPages(options, deps) {
  /** @type {string[]} */
  const failures = [];
  let response;
  try {
    response = await deps.fetch(`${options.baseUrl}/`);
  } catch (error) {
    return { failures: [`/ could not be reached: ${error instanceof Error ? error.message : String(error)}`], blocked: false };
  }
  const html = await response.text();
  if (challenged(response)) {
    return { failures: [blockedSentence("/")], blocked: true };
  }
  if (response.status !== 200) {
    failures.push(`/ answered ${response.status}, not 200`);
  } else {
    if (!html.includes(PAGE_MARKER)) {
      failures.push("/ is not this app's page (no Tide & Tumble application-name)");
    }
    if (!(response.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'")) {
      failures.push("/ was served without its Content-Security-Policy (public/_headers)");
    }
    if (!response.headers.get("strict-transport-security")) {
      failures.push("/ was served without Strict-Transport-Security");
    }
  }

  let missing;
  try {
    missing = await deps.fetch(`${options.baseUrl}${NOT_A_PAGE}`);
  } catch (error) {
    failures.push(`${NOT_A_PAGE} could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    return { failures, blocked: false };
  }
  await missing.body?.cancel();
  if (challenged(missing)) {
    return { failures: [blockedSentence(NOT_A_PAGE)], blocked: true };
  }
  if (missing.status !== 404) {
    failures.push(`${NOT_A_PAGE} answered ${missing.status}, not 404`);
  }
  return { failures, blocked: false };
}

/**
 * Does the data API answer as it should at this address (TIDES_CHECK)?
 *
 * @param {HealthOptions} options
 * @param {HealthDeps} deps
 * @returns {Promise<{ failures: string[], blocked: boolean }>}
 */
async function checkData(options, deps) {
  const url = `${options.baseUrl}${TIDES_CHECK}`;
  let response;
  try {
    response = await deps.fetch(url, { headers: { ...SAME_ORIGIN } });
  } catch (error) {
    return { failures: [`${TIDES_CHECK} could not be reached: ${error instanceof Error ? error.message : String(error)}`], blocked: false };
  }
  if (challenged(response)) {
    await response.body?.cancel();
    return { failures: [blockedSentence(TIDES_CHECK)], blocked: true };
  }
  /** @type {any} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: every answer of the API is, so this is not the API.
  }
  const error = typeof body?.error === "string" ? body.error : null;
  if (new URL(options.baseUrl).hostname.endsWith(".workers.dev")) {
    if (response.status === 404 && error === "not_found") return { failures: [], blocked: false };
    return {
      failures: [`${TIDES_CHECK} answered ${response.status} ${error ?? ""}, but the data API must never answer off the production address`.replace("  ", " ")],
      blocked: false,
    };
  }
  if (response.status === 200 && Array.isArray(body?.extrema) && body.extrema.length > 0) {
    return { failures: [], blocked: false };
  }
  if (response.status === 502 && error === "upstream_unavailable") {
    // NOAA did not answer the Worker, and the Worker said so: the release is not at fault.
    return { failures: [], blocked: false };
  }
  const said = body === null ? "an answer that is not JSON" : error !== null ? `"${error}"` : "no tide table";
  return { failures: [`${TIDES_CHECK} answered ${response.status} with ${said}, not a tide table`], blocked: false };
}

/**
 * Checks a deployed site: the API is up, the right version is answering, the
 * pages are this app's with their headers, an unknown path is a 404, the data
 * API answers a known station, and the API is fast enough.
 *
 * @param {HealthOptions} options
 * @param {HealthDeps} deps
 * @returns {Promise<HealthResult>}
 */
export async function checkHealth(options, deps) {
  const deadline = deps.now() + options.waitMs;
  let first = await probe(options, deps);
  // Waiting does not lift a challenge.
  while (first.failures.length > 0 && !first.blocked && deps.now() + RETRY_MS <= deadline) {
    await deps.sleep(RETRY_MS);
    first = await probe(options, deps);
  }
  if (first.blocked) {
    return {
      ok: false,
      blocked: true,
      url: options.baseUrl,
      tag: null,
      versionId: null,
      samples: options.samples,
      p95Ms: null,
      limitMs: options.p95Ms,
      failures: first.failures,
    };
  }

  const checked = await checkPages(options, deps);
  const data = checked.blocked ? { failures: [], blocked: false } : await checkData(options, deps);
  const pages = { failures: [...checked.failures, ...data.failures], blocked: checked.blocked || data.blocked };
  const failures = [...first.failures, ...pages.failures];

  /** @type {number | null} */
  let p95Ms = null;
  if (pages.blocked) {
    return {
      ok: false,
      blocked: true,
      url: options.baseUrl,
      tag: first.tag,
      versionId: first.versionId,
      samples: options.samples,
      p95Ms,
      limitMs: options.p95Ms,
      failures: pages.failures,
    };
  }
  if (failures.length === 0) {
    const durations = [];
    for (let sample = 0; sample < options.samples; sample += 1) {
      const started = deps.now();
      try {
        const response = await deps.fetch(`${options.baseUrl}/api/health`);
        await response.arrayBuffer();
        if (response.status !== 200) {
          failures.push(`/api/health answered ${response.status} during timing`);
          break;
        }
      } catch (error) {
        failures.push(`/api/health failed during timing: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      durations.push(deps.now() - started);
    }
    if (durations.length === options.samples) {
      p95Ms = Math.round(p95(durations));
      if (p95Ms >= options.p95Ms) {
        failures.push(`p95 ${p95Ms} ms is not under the limit of ${options.p95Ms} ms`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    blocked: false,
    url: options.baseUrl,
    tag: first.tag,
    versionId: first.versionId,
    samples: options.samples,
    p95Ms,
    limitMs: options.p95Ms,
    failures,
  };
}

/**
 * Which Worker version the site says is answering, read from /api/health
 * whatever its status. Null, with the reason, when the site cannot say:
 * Cloudflare's bot protection blocked the request, the answer holds no
 * version (another host serves the address), or the site could not be reached.
 *
 * @param {string} baseUrl
 * @param {HealthDeps} deps
 * @returns {Promise<{ versionId: string | null, detail: string }>}
 */
export async function answeringVersion(baseUrl, deps) {
  let response;
  try {
    response = await deps.fetch(`${baseUrl}/api/health`);
  } catch (error) {
    return { versionId: null, detail: `/api/health could not be reached: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (challenged(response)) {
    await response.body?.cancel();
    return { versionId: null, detail: blockedSentence("/api/health") };
  }
  const body = /** @type {{ version?: { id?: unknown } } | null} */ (await response.json().catch(() => null));
  const id = body?.version?.id;
  if (typeof id !== "string" || id === "") {
    return { versionId: null, detail: `/api/health answered ${response.status} with no version` };
  }
  // The id goes on Wrangler's command line, so only a Cloudflare version id is taken: text such as "--help"
  // would be read as a flag.
  if (!VERSION_ID.test(id)) {
    return {
      versionId: null,
      detail: `/api/health answered ${response.status} with a version id that is not a Cloudflare version id`,
    };
  }
  return { versionId: id, detail: `/api/health answered ${response.status}` };
}

/**
 * How long one request may take, answer included. An address that accepts the
 * connection and never answers would otherwise hold a release, or the daily
 * check, until the job's own time limit.
 */
export const FETCH_TIMEOUT_MS = 10_000;

/**
 * The real network and clock, with each request given up after `timeoutMs`.
 *
 * @param {number} [timeoutMs]
 * @returns {HealthDeps}
 */
export function networkDeps(timeoutMs = FETCH_TIMEOUT_MS) {
  return {
    fetch: (url, init = {}) =>
      fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "health-check", ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      }),
    now: () => performance.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** The real network and clock. @type {HealthDeps} */
export const realDeps = networkDeps();
