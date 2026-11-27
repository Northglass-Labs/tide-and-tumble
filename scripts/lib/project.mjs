import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonc } from "./jsonc.mjs";

/** The repository root, where wrangler.jsonc and package.json live. */
export const ROOT = new URL("../../", import.meta.url);
export const ROOT_PATH = fileURLToPath(ROOT);

/** The Worker's name, which is also how its workers.dev address starts. */
export const WORKER = "tide-and-tumble";

/**
 * The site's address. The data API answers only here (APP_ORIGIN), and once
 * the operator has attached the zone route, production is checked here.
 */
export const PRODUCTION_ORIGIN = "https://tideandtumble.app";

/** Where `next build` writes the static export, and what Wrangler uploads. */
export const ASSETS_DIR = "out";

/**
 * Everything wrong with a parsed wrangler.jsonc for this app, one sentence
 * each (docs/specs/2026-11-27-workers-hosting.md and ADR-006 give the
 * reasons). Empty when it keeps the contract.
 *
 * @param {Record<string, any>} config
 * @returns {string[]}
 */
export function configProblems(config) {
  /** @type {string[]} */
  const problems = [];
  const has = (/** @type {string} */ key) => Object.prototype.hasOwnProperty.call(config, key);

  if (config.name !== WORKER) problems.push(`"name" must be "${WORKER}".`);
  if (config.main !== "./src/worker/index.ts") problems.push('"main" must be "./src/worker/index.ts".');
  // Declared here, a route or a custom domain goes live with any deploy, and Wrangler run without a terminal
  // replaces a hostname's DNS record when it attaches a custom domain. The operator attaches the route by hand.
  for (const key of ["route", "routes"]) {
    if (has(key)) problems.push(`"${key}" must not be set: production is reached by a zone route attached outside this repository.`);
  }
  // Workers Cache bills every request to the Worker, static files included.
  if (has("cache")) problems.push('"cache" must not be set: Workers Cache would count every static file against the daily limit.');
  // A public repository: the account comes from the environment, never from the file.
  if (has("account_id")) problems.push('"account_id" must not be set: it is an account identifier, and this repository is public.');
  // Another environment could carry its own routes, domains or bindings.
  if (has("env")) problems.push('"env" must not be set: one configuration, one Worker.');
  if (has("triggers")) problems.push('"triggers" must not be set: the app has no scheduled work.');
  if (config.workers_dev !== true) problems.push('"workers_dev" must be true: the first release and a release while production cannot answer are checked there.');
  if (config.preview_urls !== false) problems.push('"preview_urls" must be false, written out (ADR-006).');

  const assets = config.assets ?? {};
  if (assets.directory !== `./${ASSETS_DIR}`) problems.push(`"assets.directory" must be "./${ASSETS_DIR}".`);
  if (assets.binding !== "ASSETS") problems.push('"assets.binding" must be "ASSETS".');
  if (assets.not_found_handling !== "404-page") problems.push('"assets.not_found_handling" must be "404-page".');
  if (assets.html_handling !== "auto-trailing-slash") problems.push('"assets.html_handling" must be "auto-trailing-slash".');
  if (JSON.stringify(assets.run_worker_first) !== JSON.stringify(["/api/*"])) {
    problems.push('"assets.run_worker_first" must be exactly ["/api/*"]: only the API runs the Worker.');
  }
  if (config.observability?.logs?.invocation_logs !== false) {
    problems.push('"observability.logs.invocation_logs" must be false: the API keeps no record of who asked.');
  }
  if (config.vars?.APP_ORIGIN !== PRODUCTION_ORIGIN) problems.push(`"vars.APP_ORIGIN" must be "${PRODUCTION_ORIGIN}".`);
  return problems;
}

/**
 * What the delivery scripts need to know about this app, read from
 * wrangler.jsonc once it keeps the contract. `configPath` is that file, which
 * every Wrangler call is given with --config.
 *
 * A carriage return that does not end a line is refused: Wrangler ends a
 * `//` comment there and this project's reader does not, so the two would
 * read different settings from the same file.
 *
 * @param {URL} [root]
 * @returns {{ worker: string, origin: string, configPath: string }}
 */
export function readProject(root = ROOT) {
  const configUrl = new URL("wrangler.jsonc", root);
  const text = readFileSync(configUrl, "utf8");
  if (/\r(?!\n)/.test(text)) {
    throw new Error(
      "wrangler.jsonc has a carriage return that does not end a line. Wrangler ends a // comment there and this " +
        "project's reader does not, so they would read different settings: save it with ordinary line endings.",
    );
  }
  const config = /** @type {Record<string, any>} */ (parseJsonc(text));
  const problems = configProblems(config);
  if (problems.length > 0) {
    throw new Error(`wrangler.jsonc breaks this app's contract:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  }
  return { worker: WORKER, origin: PRODUCTION_ORIGIN, configPath: realpathSync(fileURLToPath(configUrl)) };
}

/**
 * Wrangler configurations that a Wrangler call without an explicit config
 * would read instead of this repository's wrangler.jsonc: it looks for
 * wrangler.json first, then wrangler.jsonc, then wrangler.toml, in the
 * working directory and every directory above it. Any wrangler.json or
 * wrangler.toml there is listed, nearest first.
 *
 * @param {URL} [root]
 * @returns {string[]}
 */
export function strayConfigs(root = ROOT) {
  /** @type {string[]} */
  const found = [];
  let dir = realpathSync(fileURLToPath(root));
  for (;;) {
    for (const name of ["wrangler.json", "wrangler.toml"]) {
      if (existsSync(join(dir, name))) {
        found.push(join(dir, name));
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return found;
    }
    dir = parent;
  }
}
