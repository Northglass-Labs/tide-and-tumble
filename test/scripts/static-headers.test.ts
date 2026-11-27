import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * public/_headers is plain text that Cloudflare applies to the static files.
 * Nothing else would notice if a rule were weakened, so its promises are
 * pinned here (docs/specs/2026-11-27-workers-hosting.md, "Headers").
 */
const TEXT = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");

function rules(): Map<string, Map<string, string>> {
  const parsed = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of TEXT.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = new Map();
      parsed.set(line.trim(), current);
      continue;
    }
    const separator = line.indexOf(":");
    current?.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  return parsed;
}

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0] !== "")
      .map(([name, ...values]) => [name ?? "", values]),
  );
}

/** Every source file of the browser app, to compare with what the policy allows. */
function appSources(): string {
  const dir = new URL("../../src/", import.meta.url).pathname;
  const walk = (relative: string): string[] =>
    readdirSync(join(dir, relative), { withFileTypes: true }).flatMap((entry) => {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) return path.startsWith("worker") ? [] : walk(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [readFileSync(join(dir, path), "utf8")] : [];
    });
  return walk("").join("\n");
}

describe("public/_headers", () => {
  const everyFile = rules().get("/*");
  const policy = directives(everyFile?.get("content-security-policy") ?? "");

  it("keeps HSTS exactly as the previous host sent it", () => {
    expect(everyFile?.get("strict-transport-security")).toBe("max-age=63072000");
  });

  it("lets pages load code and styles only from the site, inline allowed for Next's own scripts, never eval", () => {
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect([...policy.values()].flat()).not.toContain("'unsafe-eval'");
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
  });

  it("allows exactly the outside hosts the browser code calls, and no others", () => {
    const sources = appSources();
    const fetched = new Set([...sources.matchAll(/fetch\(\s*`(https:\/\/[^/`$]+)/g)].map((match) => match[1]));
    const tiles = new Set([...sources.matchAll(/url="(https:\/\/[^/"{]+)/g)].map((match) => match[1]));

    expect([...fetched]).toEqual(["https://api.zippopotam.us"]);
    expect(policy.get("connect-src")).toEqual(["'self'", ...fetched]);
    expect([...tiles]).toEqual(["https://tile.openstreetmap.org"]);
    expect(policy.get("img-src")).toEqual(["'self'", "data:", "blob:", ...tiles]);
  });

  it("forbids showing the site inside a frame", () => {
    expect(everyFile?.get("x-frame-options")).toBe("DENY");
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("sends a referrer the map tiles' policy accepts, and no more than the origin to other sites", () => {
    expect(everyFile?.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("lets only the site itself ask for location, and nothing for camera, microphone, payment or USB", () => {
    expect(everyFile?.get("permissions-policy")).toBe("geolocation=(self), camera=(), microphone=(), payment=(), usb=()");
    expect(everyFile?.get("x-content-type-options")).toBe("nosniff");
    expect(everyFile?.get("cross-origin-opener-policy")).toBe("same-origin");
  });

  it("keeps Next's hashed files four hours, not a year: the rule covers a 404 too", () => {
    expect(rules().get("/_next/static/*")?.get("cache-control")).toBe("public, max-age=14400, must-revalidate");
    // Pages themselves must not be given a long cache life.
    expect(everyFile?.has("cache-control")).toBe(false);
  });

  it("keeps the 404 page's own address out of search results: static files answer it with 200", () => {
    // Cloudflare serves out/404.html with a 404 for every path that matches no file, but asked for by its own
    // name it is a file, and only a Worker could change that status (docs/specs, "Not in this change").
    expect(rules().get("/404")?.get("x-robots-tag")).toBe("noindex");
  });

  it("keeps the workers.dev address out of search results, without naming the account's subdomain", () => {
    expect(rules().get("https://:worker.:subdomain.workers.dev/*")?.get("x-robots-tag")).toBe("noindex");
  });
});
