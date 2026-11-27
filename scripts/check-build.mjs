#!/usr/bin/env node
/**
 * npm run check   (run `npm run build` first; `npm run verify` does)
 *
 * Holds the static export in out/ to what may be uploaded, and prints one
 * JSON line. Exits 1 if anything is wrong:
 *   - no dotfile, private key or symbolic link (public/.assetsignore is the
 *     one dotfile, and Wrangler never uploads it)
 *   - the files the configuration and the checks rely on are there
 *   - every page the sitemap names was exported
 *   - the free plan's limits: 20,000 files, 25 MiB each, 100 header rules
 */
import { readFileSync, statSync } from "node:fs";
import { buildProblems, listOutput } from "./lib/build-output.mjs";
import { ASSETS_DIR, PRODUCTION_ORIGIN, ROOT } from "./lib/project.mjs";
import { runMain, StepFailed } from "./lib/run.mjs";

const OUT = new URL(`${ASSETS_DIR}/`, ROOT);

await runMain(async () => {
  const { files, links } = listOutput(new URL(OUT).pathname);
  if (files.length === 0) {
    throw new StepFailed("find the static export in out/: run `npm run build` first");
  }
  const read = (/** @type {string} */ path) => {
    try {
      return readFileSync(new URL(path, OUT), "utf8");
    } catch {
      return "";
    }
  };
  const problems = buildProblems(
    {
      files,
      links,
      size: (path) => statSync(new URL(path, OUT)).size,
      sitemap: read("sitemap.xml"),
      headers: read("_headers"),
      read,
    },
    PRODUCTION_ORIGIN,
  );
  console.log(JSON.stringify({ ok: problems.length === 0, files: files.length, problems }));
  if (problems.length > 0) {
    process.exitCode = 1;
  }
});
