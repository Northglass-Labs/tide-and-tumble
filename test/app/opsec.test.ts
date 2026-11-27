import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Never published: dependencies, build and tool output, git's own files, local agent state. */
const UNPUBLISHED = /^(?:\.git|node_modules|\.next|out|\.wrangler|\.release|\.vitest|coverage)(?:\/|$)/;

/**
 * Every file in the tree, as an export of the repository (`git archive`) has
 * no git index to ask. Build and tool output is left out; `.claude/` holds
 * only the shared progress record.
 */
function walkTree(dir = root, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (UNPUBLISHED.test(path)) return [];
    if (path.startsWith(".claude/") && path !== ".claude/context" && path !== ".claude/context/progress.md") return [];
    if (entry.isDirectory()) return walkTree(join(dir, entry.name), path);
    return entry.isFile() ? [path] : [];
  });
}

/**
 * Every file git would publish: tracked files and new ones it does not
 * ignore. Without a git work tree (an exported copy), every file in the tree.
 */
function publishedFiles(): string[] {
  try {
    return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\0")
      .filter((path) => path !== "" && existsSync(join(root, path)));
  } catch {
    return walkTree();
  }
}

/** Binary files and the bundled station data are not scanned. */
const textOnly = (path: string) =>
  !/\.(?:png|jpe?g|gif|webp|ico|ogg|mp3|wav|woff2?|ttf|otf|lottie)$/i.test(path) &&
  !/^src\/lib\/(?:noaa|ndbc)-stations\.json$/.test(path) &&
  !/^public\/emoji\//.test(path);

/** The public documents: what a reader of the repository reads first. */
const PUBLIC_DOCS = /^(?:README\.md|AGENTS\.md|CLAUDE\.md|docs\/DELIVERY\.md|docs\/specs\/.+)$/;

/** Public government data captured for tests: it carries NOAA and NWS contact addresses. */
const UPSTREAM_FIXTURES = /^test\/fixtures\/upstream\//;

/** The patterns that would carry private operations detail, in any published file. */
const PRIVATE_DETAIL: { name: string; pattern: RegExp; skip?: RegExp }[] = [
  // The tests' canary account id, 0123456789abcdef0123456789abcdef, is allowed: no account has it.
  { name: "Cloudflare account, zone or route ids", pattern: /\b(?!0123456789abcdef0123456789abcdef\b)[0-9a-f]{32}\b/, skip: /^package-lock\.json$|^test\/fixtures\// },
  { name: "Vercel team, project or deployment ids", pattern: /\b(?:team|prj|dpl)_[A-Za-z0-9]{16,}\b/ },
  { name: "workers.dev account subdomains", pattern: /\b[a-z0-9-]+\.(?!example\.)[a-z0-9-]+\.workers\.dev\b/i },
  { name: "nameservers", pattern: /\b[a-z0-9-]+\.ns\.[a-z]+\.com\b/i },
  { name: "bearer token headers", pattern: /authorization:\s*bearer/i },
  { name: "credential stores", pattern: /1password|\bop:\/\/|\.dev\.vars\b(?!\.example)/i, skip: /^\.gitignore$|^test\/app\/opsec\.test\.ts$/ },
  { name: "the private operations repository's name", pattern: /\bhomelab\b/i, skip: /^test\/app\/opsec\.test\.ts$/ },
  { name: "provider scopes or repository ids", pattern: /team\s*\/\s*scope|\brepoid\b|personal account/i, skip: /^test\/app\/opsec\.test\.ts$/ },
  { name: "private paths", pattern: /\/Users\/[A-Za-z]|~\/Projects\b/ },
];

/**
 * Operator procedure: how production is wired and run. It belongs in the
 * private operations record, so the public documents never describe it.
 */
const OPERATOR_PROCEDURE: { name: string; pattern: RegExp }[] = [
  { name: "Cloudflare API paths", pattern: /\/(?:zones|accounts)\/[^\s]*\/|workers\/routes|dns_records|rulesets\/phases/i },
  { name: "DNS record administration", pattern: /\b(?:proxied|dns-only|grey[- ]cloud|orange[- ]cloud|A record|CNAME record)\b/i },
  { name: "zone security settings", pattern: /bot fight mode|always use https|min(?:imum)? tls|ssl mode|full \(strict\)|requests_per_period/i },
  { name: "edge certificate state", pattern: /universal ssl|edge certificate|certificate pack/i },
  { name: "how a credential is created or stored", pattern: /gh secret set|create token|api tokens? page|token's? permissions?: |wrangler login/i },
  { name: "the previous host's names", pattern: /\bvercel\b/i },
];

/**
 * Addresses that may appear: the public contact, GitHub's no-reply addresses, and
 * addresses at the reserved example domains (RFC 2606) that tests use as canaries.
 */
function allowedEmail(address: string): boolean {
  if (/^(?:hello@northglass\.io|[\w.+-]+@users\.noreply\.github\.com)$/i.test(address)) return true;
  return (address.split("@")[1] ?? "").toLowerCase().split(".").includes("example");
}

/** RFC 5737 documentation ranges and the loopback and unspecified addresses. */
const ALLOWED_IPV4 = /^(?:127\.\d+\.\d+\.\d+|0\.0\.0\.0|192\.0\.2\.\d+|198\.51\.100\.\d+|203\.0\.113\.\d+)$/;

/** Lines of the given files matching a pattern, as "path:line". */
function linesMatching(files: { path: string; text: string }[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    file.text
      .split("\n")
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => pattern.test(line))
      .map(({ index }) => `${file.path}:${index + 1}`),
  );
}

describe("public-release OPSEC boundary", () => {
  const files = publishedFiles()
    .filter(textOnly)
    .map((path) => ({ path, text: read(path) }));
  const docs = files.filter((file) => PUBLIC_DOCS.test(file.path));

  test("finds the files and the public documents it scans", () => {
    const paths = files.map((file) => file.path);
    for (const expected of ["README.md", "AGENTS.md", "CLAUDE.md", "package.json"]) {
      expect(paths).toContain(expected);
    }
    expect(docs.map((file) => file.path)).toEqual(
      expect.arrayContaining(["README.md", "AGENTS.md", "CLAUDE.md", "docs/DELIVERY.md", "docs/specs/2026-11-27-workers-hosting.md"]),
    );
  });

  test("scans an exported copy with no git work tree the same way", () => {
    // `git archive` output has no index: the walk must find the same public files, and none of the output.
    const walked = walkTree();
    for (const expected of ["README.md", "AGENTS.md", "docs/DELIVERY.md", "src/worker/index.ts", ".claude/context/progress.md"]) {
      expect(walked).toContain(expected);
    }
    expect(walked.some((path) => UNPUBLISHED.test(path))).toBe(false);
    expect(walked.filter((path) => path.startsWith(".claude/"))).toEqual([".claude/context/progress.md"]);
  });

  test.each(PRIVATE_DETAIL)("publishes no $name", ({ pattern, skip }) => {
    expect(linesMatching(files.filter((file) => !skip?.test(file.path)), pattern)).toEqual([]);
  });

  test.each(OPERATOR_PROCEDURE)("keeps $name out of the public documents", ({ pattern }) => {
    expect(linesMatching(docs, pattern)).toEqual([]);
  });

  test("publishes no email address but the public contact, GitHub's no-reply addresses and example ones", () => {
    const found = files
      .filter((file) => !UPSTREAM_FIXTURES.test(file.path) && file.path !== "package-lock.json")
      .flatMap((file) =>
        [...file.text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g)]
          .map((match) => match[0])
          .filter((address) => !allowedEmail(address))
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

  test("keeps decision records and runbooks out of the public tree", () => {
    // The 2026-08-10 boundary: their decision context named private origins and provider accounts. Public
    // engineering decisions live in the design spec's Decisions section instead.
    expect(existsSync(join(root, "docs/adr"))).toBe(false);
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
