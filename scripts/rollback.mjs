#!/usr/bin/env node
/**
 * npm run rollback -- [versionId] [--origin <address>]
 *
 * Sends all traffic back to an earlier Worker version, then checks
 * production. Without a version, that is the version that was live before
 * the current one; `npx wrangler versions list --config wrangler.jsonc` shows
 * the others. Before it changes anything it confirms the address production
 * is checked at, as promote does: the site's own by default, the Worker's
 * workers.dev address with --origin.
 *
 * This restores the code and the static files of that version, which were
 * uploaded with it. It does not move the zone route: going back to the
 * previous host is the operator's (docs/DELIVERY.md).
 *
 * Progress goes to stderr; stdout carries the health check and a summary,
 * one JSON line each. The steps themselves are in scripts/lib/release.mjs.
 */
import { readProject } from "./lib/project.mjs";
import { ORIGIN_USAGE, realTools, rollback } from "./lib/release.mjs";
import { runMain } from "./lib/run.mjs";
import { redact } from "./lib/wrangler-output.mjs";

const USAGE = `Usage: npm run rollback -- [versionId] [--origin <address>]\n${ORIGIN_USAGE}`;

await runMain(async () => {
  const args = process.argv.slice(2);
  /** @type {string | undefined} */
  let requested;
  /** @type {string | undefined} */
  let origin;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--origin" && origin === undefined && args[index + 1] !== undefined) {
      origin = args[index + 1];
      index += 1;
    } else if (arg !== undefined && !arg.startsWith("--") && requested === undefined) {
      requested = arg;
    } else {
      throw new Error(USAGE);
    }
  }
  const summary = await rollback(readProject(), requested, realTools, { origin });
  console.log(redact(JSON.stringify(summary)));
  if (!summary.ok) {
    process.exitCode = 1;
  }
});
