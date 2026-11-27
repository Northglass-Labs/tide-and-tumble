#!/usr/bin/env node
/**
 * node scripts/prepare-release.mjs   (then `npm run promote`, which is given the token)
 *
 * Builds and checks the current commit with no Cloudflare credential in
 * reach, and records it for `promote`:
 *
 *   1. refuse while a Cloudflare token or key is in the environment (the
 *      build runs project and dependency code, which could read it)
 *   2. refuse a working tree with uncommitted changes, files git does not
 *      fully see, or a commit that is not GitHub's main
 *   3. refuse symbolic links in the commit
 *   4. remove out/, then make a clean copy of the commit (a detached worktree
 *      in a temporary folder); there, `npm ci --ignore-scripts` and
 *      `npm run verify`, and check that out/ holds no dotfile, key or link
 *   5. copy that out/ here, remove the clean copy, and `npm ci
 *      --ignore-scripts` here for the Wrangler promote runs
 *   6. record the commit and a digest of out/ in
 *      node_modules/.cache/tide-and-tumble-release.json
 *
 * Progress goes to stderr; stdout carries one JSON line. The steps are in
 * scripts/lib/release.mjs.
 */
import { readProject } from "./lib/project.mjs";
import { prepareRelease, realTools } from "./lib/release.mjs";
import { runMain } from "./lib/run.mjs";
import { redact } from "./lib/wrangler-output.mjs";

await runMain(async () => {
  if (process.argv.length > 2) {
    throw new Error("Usage: node scripts/prepare-release.mjs");
  }
  console.log(redact(JSON.stringify(await prepareRelease(readProject(), realTools))));
});
