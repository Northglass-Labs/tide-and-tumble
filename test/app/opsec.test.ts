import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** git's own files: never published, and never named in .gitignore. */
const GIT_DIR = /^\.git(?:\/|$)/;

/** One .gitignore rule as a test on a path relative to the root. */
interface IgnoreRule {
  pattern: RegExp;
  negate: boolean;
  /** The rule's path, without a leading or trailing slash. */
  path: string;
}

/** The repository's .gitignore, enough of its syntax for this repository's rules. */
function ignoreRules(): IgnoreRule[] {
  if (!existsSync(join(root, ".gitignore"))) return [];
  return read(".gitignore")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const negate = line.startsWith("!");
      let rule = negate ? line.slice(1) : line;
      const directory = rule.endsWith("/");
      if (directory) rule = rule.slice(0, -1);
      const anchored = rule.includes("/");
      if (rule.startsWith("/")) rule = rule.slice(1);
      const body = rule
        .split("**")
        .map((part) => part.split("*").map((text) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
        .join(".*");
      return { pattern: new RegExp(`${anchored ? "^" : "(?:^|/)"}${body}(?:/|$)`), negate, path: rule };
    });
}

/**
 * Every file in the tree that git would not ignore, as an export of the
 * repository (`git archive`) has no index to ask.
 */
function walkTree(rules = ignoreRules(), dir = root, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    let ignored = GIT_DIR.test(path);
    for (const rule of rules) {
      if (rule.pattern.test(path)) ignored = !rule.negate;
    }
    // An ignored folder is skipped whole, unless a later rule brings back something inside it.
    const reopened = entry.isDirectory() && rules.some((rule) => rule.negate && rule.path.startsWith(`${path}/`));
    if (ignored && !reopened) {
      return [];
    }
    if (entry.isDirectory()) return walkTree(rules, join(dir, entry.name), path);
    return entry.isFile() && !ignored ? [path] : [];
  });
}

/** Tracked files, by git's index. Null without a git work tree (an exported copy). */
function trackedFiles(): string[] | null {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\0")
      .filter((path) => path !== "" && existsSync(join(root, path)));
  } catch {
    return null;
  }
}

/** What is published: the tracked files, or without git, every file git would not ignore. */
const publishedFiles = (): string[] => trackedFiles() ?? walkTree();

/** Binary files and the bundled station data are not scanned. */
const textOnly = (path: string) =>
  !/\.(?:png|jpe?g|gif|webp|ico|ogg|mp3|wav|woff2?|ttf|otf|lottie)$/i.test(path) &&
  !/^src\/lib\/(?:noaa|ndbc)-stations\.json$/.test(path) &&
  !/^public\/emoji\//.test(path);

/** The public documents: what a reader of the repository reads first. */
const PUBLIC_DOCS = /^(?:README\.md|AGENTS\.md|CLAUDE\.md|docs\/DELIVERY\.md|docs\/specs\/.+)$/;

/** Public government data captured for tests: it carries NOAA and NWS contact addresses. */
const UPSTREAM_FIXTURES = /^test\/fixtures\/upstream\//;

/**
 * High-signal patterns: what operations detail looks like when it leaks, in
 * any published file, workflow comments included. They catch identifiers,
 * commands, rule syntax and thresholds, not prose: a sentence describing the
 * private record in other words passes, so the boundary is held by review as
 * well (AGENTS.md).
 */
const PRIVATE_DETAIL: { name: string; pattern: RegExp; skip?: RegExp }[] = [
  // The tests' canary account id, 0123456789abcdef0123456789abcdef, is allowed: no account has it.
  { name: "Cloudflare account, zone or route ids", pattern: /\b(?!0123456789abcdef0123456789abcdef\b)[0-9a-f]{32}\b/, skip: /^package-lock\.json$|^test\/fixtures\// },
  { name: "Vercel team, project or deployment ids", pattern: /\b(?:team|prj|dpl)_[A-Za-z0-9]{16,}\b/ },
  { name: "workers.dev account subdomains", pattern: /\b[a-z0-9-]+\.(?!example\.)[a-z0-9-]+\.workers\.dev\b/i },
  { name: "nameservers", pattern: /\b[a-z0-9-]+\.ns\.[a-z]+\.com\b/i },
  { name: "bearer token headers", pattern: /authorization:\s*bearer/i },
  { name: "credential stores", pattern: /1password|\bop:\/\/|\.dev\.vars\b(?!\.example)/i, skip: /^\.gitignore$/ },
  { name: "the private operations repository's name", pattern: /\bhomelab\b/i },
  { name: "provider scopes or repository ids", pattern: /team\s*\/\s*scope|\brepoid\b|personal account/i },
  { name: "private paths", pattern: /\/Users\/[A-Za-z]|~\/Projects\b/ },
  { name: "commands that store a credential", pattern: /\bgh\s+(?:secret|variable)\s+set\b/i },
  {
    name: "zone and account settings",
    pattern:
      /bot fight mode|always use https|universal ssl|edge certificate|certificate pack|ssl\/tls|full \(strict\)|dns analytics|\bzone[ _]id\b|\bproxied\b|dns-only|grey[- ]cloud|orange[- ]cloud|hobby plan|uptime (?:monitor|kuma)|fail[- ](?:open|closed)/i,
  },
  { name: "rule expressions", pattern: /\bhttp\.request\.(?:uri|headers|method|full_uri)\b|\bcf\.(?:client|threat_score|bot_management)\b|\bip\.src\b/ },
  {
    name: "request thresholds",
    pattern: /\b\d+\s+requests?\s+(?:in|per|every|over)\s+\d+\s+seconds?\b|requests_per_period|mitigation_timeout|counted over \d+ seconds/i,
  },
];

/** Operator procedure, kept out of the public documents: how production is wired and run. */
const OPERATOR_PROCEDURE: { name: string; pattern: RegExp }[] = [
  { name: "Cloudflare API paths", pattern: /\/(?:zones|accounts)\/[^\s]*\/|workers\/routes|dns_records|rulesets\/phases/i },
  { name: "DNS record administration", pattern: /\b(?:A record|CNAME record|AAAA record)\b/i },
  { name: "how a credential is created or stored", pattern: /create token|api tokens? page|token's? permissions?: /i },
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
    .filter((path) => path !== "test/app/opsec.test.ts")
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

  // In an exported copy there is no git to compare the walk with; the walk itself is what scans it.
  test.skipIf(trackedFiles() === null)("scans an exported copy with no git work tree the same way, skipping what git ignores", () => {
    // `git archive` output has no index: the walk must find every tracked file, and nothing git ignores, such as
    // the worker-configuration.d.ts that `npm run typecheck` writes.
    const walked = walkTree();
    const tracked = trackedFiles();
    expect(tracked).not.toBeNull();
    expect(walked).toEqual(expect.arrayContaining(tracked!));
    const extra = walked.filter((path) => !tracked!.includes(path));
    const ignoredExtra =
      extra.length === 0
        ? ""
        : execFileSync("git", ["check-ignore", "--no-index", "--stdin"], { cwd: root, encoding: "utf8", input: extra.join("\n") }).trim();
    expect(ignoredExtra).toBe("");
    expect(walked).not.toContain("worker-configuration.d.ts");
    expect(walked.filter((path) => path.startsWith(".claude/"))).toEqual([".claude/context/progress.md"]);
  });

  test("catches the kinds of leak line the review found, in made-up text", () => {
    // Each line has the shape of a kind of line the 2026-11-27 review removed, about a fictional site:
    // none states anything true about this deployment.
    const leaks = [
      "gh secret set EXAMPLE_TOKEN -R example/fictional-app",
      "Bot Fight Mode came up in a 1999 example.org workshop.",
      "The example.org rule allowed 7 requests in 3 seconds.",
      "The example.org edge certificate expired in 1999.",
      "A textbook chapter compares SSL/TLS modes, Full (strict) among them, for example.org.",
      '(http.request.method eq "PATCH" and http.request.uri.path eq "/example")',
      "The fictional example.org project sat on the Hobby plan in 1999.",
      "An example.org uptime monitor pinged its home page hourly in 1999.",
      "In the example.org lab, a record went from DNS-only to proxied.",
      "Account abcdefabcdefabcdefabcdefabcdefab is fictional.",
      "See https://demo-worker.fictional-subdomain.workers.dev for a made-up Worker.",
      "The example.org route was set to fail open in a 1999 drill.",
    ];
    const caught = leaks.filter((line) => PRIVATE_DETAIL.some(({ pattern }) => pattern.test(line)));
    expect(caught).toEqual(leaks);
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
