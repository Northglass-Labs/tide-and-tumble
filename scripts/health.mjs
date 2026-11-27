#!/usr/bin/env node
/**
 * npm run health -- <baseUrl> [--expect-tag <sha>] [--samples 20] [--p95-ms 300]
 *
 * Checks a running site and prints one JSON line. Exits 1 if anything is
 * wrong:
 *   - GET /api/health is 200 with ok: true
 *   - the version answering has the expected git tag, when one is given
 *   - GET / is 200, is this app's page, and carries its security headers
 *   - an unknown path is the 404 page with status 404
 *   - the 95th percentile of the timed samples of /api/health is under the limit
 * A check Cloudflare's bot protection challenged is reported with
 * "blocked": true; it fails, but says nothing about health either way.
 *
 * `promote` and `rollback` use the same check through scripts/lib/health-check.mjs.
 */
import { checkHealth, parseHealthArgs, realDeps } from "./lib/health-check.mjs";
import { runMain } from "./lib/run.mjs";
import { redact } from "./lib/wrangler-output.mjs";

await runMain(async () => {
  const result = await checkHealth(parseHealthArgs(process.argv.slice(2)), realDeps);
  console.log(redact(JSON.stringify(result)));
  if (!result.ok) {
    process.exitCode = 1;
  }
});
