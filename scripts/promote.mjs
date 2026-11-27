#!/usr/bin/env node
/**
 * npm run promote [-- --origin <address>]
 *
 * Releases the build `node scripts/prepare-release.mjs` made of the current
 * commit, and puts the previous version back if production is not healthy
 * afterwards (docs/DELIVERY.md). It runs no build and no npm: it holds the
 * token, and Wrangler is the only package code it runs.
 *
 *   1. refuse a working tree with uncommitted changes or files git does not
 *      fully see, and a commit that is not main's (on GitHub: not the run's
 *      commit on main)
 *   2. refuse unless prepare-release recorded this commit, and out/ is still
 *      exactly what it checked (its digest); refuse dotfiles, keys or links
 *   3. on a scheduled run, only refresh: refuse a build that lacks a beach
 *      page's tide table, and change nothing unless production runs this
 *      commit already (a rollback stays in place)
 *   4. confirm the address production is checked at: by default the site's
 *      own, which must answer with the live version (the zone route is
 *      attached); with --origin, the Worker's workers.dev address, whose
 *      version Wrangler must find (the right account)
 *   5. upload a new Worker version, tagged with the 12-character commit; stop
 *      if Wrangler names an address for it (Version URLs are on) or if out/
 *      changed during the upload
 *   6. read production again, then send all traffic to the new version
 *   7. check production, expecting the new version and the commit's tag;
 *      check once more if it fails
 *   8. on failure, roll back to the version that was live before (if it is
 *      still this release's that is live), and exit 1
 *
 * The first release, before the Worker exists, must name its workers.dev
 * address with --origin. Progress goes to stderr; stdout carries one JSON
 * line per health check and a final summary line, scrubbed of account
 * details. The steps themselves are in scripts/lib/release.mjs.
 */
import { appendFileSync } from "node:fs";
import { readProject } from "./lib/project.mjs";
import { ORIGIN_USAGE, promote, realTools } from "./lib/release.mjs";
import { runMain } from "./lib/run.mjs";
import { redact } from "./lib/wrangler-output.mjs";

await runMain(async () => {
  const args = process.argv.slice(2);
  let origin;
  if (args.length === 2 && args[0] === "--origin") {
    origin = args[1];
  } else if (args.length > 0) {
    throw new Error(`Usage: npm run promote [-- --origin <address>]\n${ORIGIN_USAGE}`);
  }
  const summary = await promote(readProject(), realTools, { origin });
  if (process.env.GITHUB_OUTPUT) {
    // deploy.yml's Released step, which the Dependabot merge job reads, runs only for a real release.
    appendFileSync(process.env.GITHUB_OUTPUT, `released=${summary.released}\n`);
  }
  if (!summary.released && process.env.GITHUB_ACTIONS === "true") {
    // Shown in the run's summary: a scheduled run that changed nothing says why.
    console.log(redact(`::notice title=Nothing released::${summary.reason}`));
  }
  console.log(redact(JSON.stringify(summary)));
});
