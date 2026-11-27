#!/usr/bin/env node
/**
 * npm run promote [-- --origin <address>]
 *
 * Releases the current commit to production, and puts the previous version
 * back if production is not healthy afterwards (docs/DELIVERY.md):
 *
 *   1. refuse a working tree with uncommitted changes
 *   2. refuse a commit that is not main's (on GitHub: not the run's commit on main)
 *   3. install exactly what package-lock.json lists (npm ci), build the static
 *      export, and refuse dotfiles, keys or links in out/
 *   4. confirm the address production is checked at: by default the site's
 *      own, which must answer with the live version (the zone route is
 *      attached); with --origin, the Worker's workers.dev address, whose
 *      version Wrangler must find (the right account)
 *   5. upload a new Worker version, tagged with the 12-character commit, and
 *      stop if Wrangler names an address for it (Version URLs are on)
 *   6. read production again, then send all traffic to the new version
 *   7. check production, expecting the commit's tag; check once more if it fails
 *   8. on failure, roll back to the version that was live before (if it is
 *      still this release's that is live), and exit 1
 *
 * The first release, before the Worker exists, must name its workers.dev
 * address with --origin. Progress goes to stderr; stdout carries one JSON
 * line per health check and a final summary line, scrubbed of account
 * details. The steps themselves are in scripts/lib/release.mjs.
 */
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
  console.log(redact(JSON.stringify(await promote(readProject(), realTools, { origin }))));
});
