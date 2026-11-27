#!/usr/bin/env node
/**
 * node scripts/take-build.mjs <folder>   (deploy.yml's release job, with no token)
 *
 * Takes the build the build job kept into this workspace: only regular files
 * under out/ and the record prepare-release wrote. Anything else in the
 * folder (a link, a package, a script) refuses the whole artifact. The rules
 * are in scripts/lib/take-build.mjs.
 */
import { ROOT_PATH } from "./lib/project.mjs";
import { runMain } from "./lib/run.mjs";
import { takeBuild } from "./lib/take-build.mjs";

await runMain(async () => {
  const [from, ...rest] = process.argv.slice(2);
  if (!from || rest.length > 0) {
    throw new Error("Usage: node scripts/take-build.mjs <folder>");
  }
  console.log(JSON.stringify({ ok: true, files: takeBuild(from, ROOT_PATH) }));
});
