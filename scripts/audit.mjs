#!/usr/bin/env node
/**
 * npm run audit [-- --strict]
 *
 * Checks the dependencies for known vulnerabilities with `npm audit` and
 * prints one JSON line: { ok, blocking, noted }. Exits 1 if anything blocks:
 *   - any advisory in a production dependency
 *   - a high or critical advisory in a development tool
 *   - with --strict, any advisory at all (the daily check)
 * Moderate, low and info advisories in development tools are listed under
 * `noted` without failing. It needs the network; if npm cannot get a report,
 * it fails.
 */
import { parseAuditArgs, realDeps, runAudit } from "./lib/audit.mjs";
import { runMain } from "./lib/run.mjs";

await runMain(async () => {
  const result = runAudit(parseAuditArgs(process.argv.slice(2)), realDeps);
  console.log(JSON.stringify(result));
  if (!result.ok) {
    process.exitCode = 1;
  }
});
