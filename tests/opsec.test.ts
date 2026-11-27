import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/**
 * Every file git would publish: tracked files and new ones it does not
 * ignore. Binary files and the bundled station data are skipped.
 */
function publishedTextFiles(): string[] {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => path !== "" && existsSync(join(root, path)));
  return listed.filter(
    (path) =>
      !/\.(?:png|jpe?g|gif|webp|ico|ogg|mp3|wav|woff2?|ttf|otf|lottie)$/i.test(path) &&
      !/^src\/lib\/(?:noaa|ndbc)-stations\.json$/.test(path) &&
      !/^public\/emoji\//.test(path),
  );
}

/** Public government data captured for tests: it carries NOAA and NWS contact addresses. */
const UPSTREAM_FIXTURES = /^test\/fixtures\/upstream\//;

/** The patterns that would carry private operations detail (ADR-007). */
const PRIVATE_DETAIL: { name: string; pattern: RegExp; skip?: RegExp }[] = [
  { name: "a Cloudflare account, zone or route id", pattern: /\b[0-9a-f]{32}\b/, skip: /^package-lock\.json$|^test\/fixtures\// },
  { name: "a Vercel team, project or deployment id", pattern: /\b(?:team|prj|dpl)_[A-Za-z0-9]{16,}\b/ },
  { name: "a workers.dev account subdomain", pattern: /\b[a-z0-9-]+\.(?!example\.)[a-z0-9-]+\.workers\.dev\b/i },
  { name: "a nameserver", pattern: /\b[a-z0-9-]+\.ns\.[a-z]+\.com\b/i },
  { name: "a bearer token header", pattern: /authorization:\s*bearer/i },
  { name: "a credential store", pattern: /1password|\bop:\/\/|\.dev\.vars\b(?!\.example)/i, skip: /^\.gitignore$|^tests\/opsec\.test\.ts$/ },
  { name: "the private operations repository", pattern: /\bhomelab\b/i, skip: /^tests\/opsec\.test\.ts$/ },
  { name: "a provider scope or repository id", pattern: /team\s*\/\s*scope|\brepoid\b|personal account/i, skip: /^tests\/opsec\.test\.ts$/ },
  { name: "a private path", pattern: /\/Users\/[A-Za-z]|~\/Projects\b/ },
];

/** Addresses that may appear: the public contact and GitHub's no-reply addresses. */
const ALLOWED_EMAIL = /^(?:hello@northglass\.io|[\w.+-]+@users\.noreply\.github\.com)$/i;

/** RFC 5737 documentation ranges and the loopback and unspecified addresses. */
const ALLOWED_IPV4 = /^(?:127\.\d+\.\d+\.\d+|0\.0\.0\.0|192\.0\.2\.\d+|198\.51\.100\.\d+|203\.0\.113\.\d+)$/;

describe("public-release OPSEC boundary", () => {
  const files = publishedTextFiles().map((path) => ({ path, text: read(path) }));

  test("finds the files it scans", () => {
    const paths = files.map((file) => file.path);
    for (const expected of ["README.md", "AGENTS.md", "CLAUDE.md", "package.json"]) {
      expect(paths).toContain(expected);
    }
  });

  test.each(PRIVATE_DETAIL)("publishes no $name", ({ pattern, skip }) => {
    const found = files
      .filter((file) => !skip?.test(file.path))
      .flatMap((file) =>
        file.text
          .split("\n")
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => pattern.test(line))
          .map(({ index }) => `${file.path}:${index + 1}`),
      );
    expect(found).toEqual([]);
  });

  test("publishes no email address but the public contact and GitHub's no-reply addresses", () => {
    const found = files
      .filter((file) => !UPSTREAM_FIXTURES.test(file.path) && file.path !== "package-lock.json")
      .flatMap((file) =>
        [...file.text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g)]
          .map((match) => match[0])
          .filter((address) => !ALLOWED_EMAIL.test(address))
          .map((address) => `${file.path}: ${address}`),
      );
    expect(found).toEqual([]);
  });

  test("publishes no IPv4 address outside the documentation ranges", () => {
    const found = files
      .filter((file) => !UPSTREAM_FIXTURES.test(file.path) && file.path !== "package-lock.json")
      .flatMap((file) =>
        [...file.text.matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g)]
          .map((match) => match[0])
          .filter((address) => !ALLOWED_IPV4.test(address))
          .map((address) => `${file.path}: ${address}`),
      );
    expect(found).toEqual([]);
  });

  test("keeps operator runbooks out of the public tree", () => {
    // Decision records are public (docs/adr, ADR-007); operating procedures are not.
    expect(existsSync(join(root, "docs/runbooks"))).toBe(false);
  });

  test("uses only the Northglass public maintainer identity", () => {
    // Attribution is a legal surface, so it carries the legal entity name
    // (`Northglass LLC`), not the public parent name or the older `Northglass Labs`.
    expect(read("AUTHORS").trim()).toBe(
      "Northglass LLC <hello@northglass.io> — author and maintainer",
    );
    expect(existsSync(join(root, ".mailmap"))).toBe(false);
  });

  test("contains no maintainer-directed location breadcrumb", () => {
    const app = read("src/components/TideApp.tsx");
    expect(app).not.toMatch(/where you are|home beach/i);
  });
});
