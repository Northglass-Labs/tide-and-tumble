import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parseJsonc } from "../../scripts/lib/jsonc.mjs";
import { configProblems, readProject, strayConfigs } from "../../scripts/lib/project.mjs";

interface Config {
  [key: string]: unknown;
  assets: Record<string, unknown>;
}

const REAL = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
const real = () => parseJsonc(REAL) as Config;

/** A directory standing in for a repository, as the file: URL the scripts take. */
function repository(config = REAL) {
  const dir = mkdtempSync(join(tmpdir(), "project-"));
  writeFileSync(join(dir, "wrangler.jsonc"), config);
  return { dir, root: pathToFileURL(`${dir}/`) };
}

describe("wrangler.jsonc", () => {
  it("keeps the contract: assets first, only /api/* runs the Worker, Version URLs off, no logs of who asked", () => {
    expect(configProblems(real())).toEqual([]);
    const config = real();
    expect(config.preview_urls).toBe(false);
    expect(config.workers_dev).toBe(true);
    expect(config.assets).toEqual({
      directory: "./out",
      binding: "ASSETS",
      html_handling: "auto-trailing-slash",
      not_found_handling: "404-page",
      run_worker_first: ["/api/*"],
    });
    expect(config.observability).toEqual({ enabled: true, head_sampling_rate: 1, logs: { invocation_logs: false } });
  });

  it("writes Version URLs off out, since left out Wrangler keeps whatever Cloudflare has", () => {
    expect(REAL).toMatch(/^\s*"preview_urls":\s*false,?$/m);
  });

  it("refuses a route, a custom domain, Workers Cache, an account id, another environment or a cron", () => {
    for (const [key, value] of [
      ["route", "tideandtumble.app/*"],
      ["routes", [{ pattern: "tideandtumble.app", custom_domain: true }]],
      ["cache", { enabled: true }],
      ["account_id", "0".repeat(32)],
      ["env", { staging: {} }],
      ["triggers", { crons: ["0 0 * * *"] }],
    ] as const) {
      const problems = configProblems({ ...real(), [key]: value });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(`"${key}"`);
    }
  });

  it("refuses anything that would make a page view, or any path but /api/*, run the Worker", () => {
    for (const assets of [
      { run_worker_first: true },
      { run_worker_first: ["/api/*", "/*"] },
      { not_found_handling: "single-page-application" },
      { directory: "./dist" },
    ]) {
      const config = real();
      expect(configProblems({ ...config, assets: { ...config.assets, ...assets } })).not.toEqual([]);
    }
  });

  it("refuses Version URLs on, or left to Cloudflare", () => {
    const config = real();
    expect(configProblems({ ...config, preview_urls: true })).toEqual(['"preview_urls" must be false, written out (ADR-006).']);
    const without: Partial<Config> = { ...config };
    delete without.preview_urls;
    expect(configProblems(without)).toEqual(['"preview_urls" must be false, written out (ADR-006).']);
  });

  it("refuses invocation logs, which would record each request", () => {
    expect(configProblems({ ...real(), observability: { enabled: true } })).toEqual([
      '"observability.logs.invocation_logs" must be false: the API keeps no record of who asked.',
    ]);
  });
});

describe("readProject()", () => {
  it("names the configuration it read, so every Wrangler call can be given exactly it", () => {
    const { dir, root } = repository();
    expect(readProject(root)).toEqual({
      worker: "tide-and-tumble",
      origin: "https://tideandtumble.app",
      configPath: realpathSync(join(dir, "wrangler.jsonc")),
    });
  });

  it("refuses a configuration that breaks the contract, saying what is wrong", () => {
    const { root } = repository(REAL.replace('"preview_urls": false', '"preview_urls": true'));
    expect(() => readProject(root)).toThrow('"preview_urls" must be false');
  });

  it("refuses a carriage return that does not end a line, where Wrangler and this reader disagree", () => {
    // Wrangler ends a // comment at a lone CR; this project's reader does not.
    const { root } = repository(REAL.replace("// The site:", '// The site:\r"name": "elsewhere",'));
    expect(() => readProject(root)).toThrow("carriage return");
  });

  it("reads a file with Windows line endings as it is", () => {
    const { root } = repository(REAL.replaceAll("\n", "\r\n"));
    expect(readProject(root).worker).toBe("tide-and-tumble");
  });
});

describe("strayConfigs()", () => {
  it("finds a wrangler.json or wrangler.toml in the repository or any directory above it", () => {
    // Wrangler looks for wrangler.json first, walking up from the working directory, so either would be read
    // instead of the reviewed wrangler.jsonc by anything not given --config.
    const outer = mkdtempSync(join(tmpdir(), "stray-"));
    const dir = join(outer, "repo");
    mkdirSync(dir);
    writeFileSync(join(dir, "wrangler.jsonc"), REAL);
    writeFileSync(join(dir, "wrangler.json"), "{}");
    writeFileSync(join(outer, "wrangler.toml"), 'name = "elsewhere"');

    const found = strayConfigs(pathToFileURL(`${dir}/`));
    expect(found).toEqual([realpathSync(join(dir, "wrangler.json")), realpathSync(join(outer, "wrangler.toml"))]);
  });

  it("finds nothing where there is only wrangler.jsonc", () => {
    const { root } = repository();
    expect(strayConfigs(root).filter((path) => path.startsWith(realpathSync(tmpdir())))).toEqual([]);
  });
});
