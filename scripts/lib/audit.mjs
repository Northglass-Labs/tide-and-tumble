import { run } from "./run.mjs";

export const USAGE = "Usage: npm run audit [-- --strict]";

/** @typedef {"info" | "low" | "moderate" | "high" | "critical"} Severity */

const SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);

/**
 * The part of an `npm audit --json` report this check reads: one entry per
 * vulnerable package, keyed by its name.
 *
 * @typedef {object} AuditReport
 * @property {Record<string, { name?: string, severity: Severity }>} vulnerabilities
 */

/**
 * @typedef {object} Finding
 * @property {string} name          The vulnerable package.
 * @property {Severity} severity
 * @property {boolean} production   It is in the production dependencies (`npm audit --omit=dev` lists it).
 */

/**
 * @typedef {object} AuditResult
 * @property {boolean} ok         Nothing blocks.
 * @property {Finding[]} blocking
 * @property {Finding[]} noted    Printed, but not failing: moderate, low and info findings in development tools.
 */

const NOT_A_REPORT = "npm audit printed something that is not a report.";

/**
 * @param {string[]} argv The arguments after the script name.
 * @returns {{ strict: boolean }}
 */
export function parseAuditArgs(argv) {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--strict")) {
    throw new Error(USAGE);
  }
  return { strict: argv.length === 1 };
}

/**
 * The report in what `npm audit --json` printed. A local npm wrapper may print
 * notice lines around it (the Mac's Safe-chain does), so the report is the text
 * from the first `{` to the last `}`. Anything that is not a report throws,
 * npm's own error included (its shape when the registry cannot be reached), so
 * the check fails rather than passing on no information.
 *
 * @param {string} stdout
 * @returns {AuditReport}
 */
export function parseAuditReport(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end < start) {
    throw new Error("npm audit printed no report.");
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    throw new Error(NOT_A_REPORT);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(NOT_A_REPORT);
  }

  const object = /** @type {{ error?: { summary?: string, code?: string }, message?: string, vulnerabilities?: unknown }} */ (parsed);
  if (object.error) {
    const reason = object.error.summary || object.message || object.error.code || "no reason given";
    throw new Error(`npm audit could not get a report: ${reason}`);
  }

  const { vulnerabilities } = object;
  if (typeof vulnerabilities !== "object" || vulnerabilities === null || Array.isArray(vulnerabilities)) {
    throw new Error(NOT_A_REPORT);
  }
  for (const entry of Object.values(vulnerabilities)) {
    const severity = typeof entry === "object" && entry !== null ? /** @type {{ severity?: unknown }} */ (entry).severity : undefined;
    if (typeof severity !== "string" || !SEVERITIES.has(severity)) {
      throw new Error(NOT_A_REPORT);
    }
  }
  return /** @type {AuditReport} */ (object);
}

/**
 * Sorts the findings of the full report. Blocking: any finding in production
 * dependencies, and high or critical ones anywhere; in strict mode, every
 * finding. A gate on moderate advisories in development tools could block every
 * pull request, the fix included, so those are noted instead.
 *
 * @param {{ all: AuditReport, production: AuditReport }} reports
 * @param {{ strict: boolean }} options
 * @returns {AuditResult}
 */
export function judgeAudit({ all, production }, { strict }) {
  const entries = { ...all.vulnerabilities, ...production.vulnerabilities };
  /** @type {Finding[]} */
  const blocking = [];
  /** @type {Finding[]} */
  const noted = [];
  for (const [key, entry] of Object.entries(entries)) {
    const finding = { name: entry.name ?? key, severity: entry.severity, production: key in production.vulnerabilities };
    const blocks = strict || finding.production || finding.severity === "high" || finding.severity === "critical";
    (blocks ? blocking : noted).push(finding);
  }
  return { ok: blocking.length === 0, blocking, noted };
}

/**
 * The arguments for `npm audit`. npm's own configuration can make it report
 * nothing (`offline`) or leave dependencies out (`NODE_ENV=production`, an
 * `omit` setting), and the check would then pass on no information, so these
 * say explicitly that it must ask the registry, about which dependencies.
 *
 * @param {boolean} omitDev The production report: everything but development tools.
 * @returns {string[]}
 */
export function npmAuditArgs(omitDev) {
  return ["audit", "--json", "--no-offline", omitDev ? "--omit=dev" : "--include=dev", "--include=optional", "--include=peer"];
}

/**
 * @typedef {object} AuditDeps
 * @property {(omitDev: boolean) => string} npmAudit What `npm audit --json` printed on stdout.
 */

/**
 * Reads the full report and the production-only report, and judges them.
 *
 * @param {{ strict: boolean }} options
 * @param {AuditDeps} deps
 * @returns {AuditResult}
 */
export function runAudit(options, deps) {
  const all = parseAuditReport(deps.npmAudit(false));
  const production = parseAuditReport(deps.npmAudit(true));
  return judgeAudit({ all, production }, options);
}

/** @type {AuditDeps} */
export const realDeps = {
  // npm exits non-zero when it finds something; only the report decides.
  npmAudit: (omitDev) => run("npm", npmAuditArgs(omitDev)).stdout,
};
