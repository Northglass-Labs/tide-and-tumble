import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What the static export must never hold, because Wrangler would upload it:
 * a dotfile (or anything inside a directory whose name starts with a dot) and
 * a file named like a private key. git ignores most of them, so one left in
 * public/ passes a clean `git status`, and Next copies public/ into out/.
 */
const KEY_LIKE = /\.(?:pem|key|p8|p12|pfx|jks|keystore)$|^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i;

/** The assets directory's own ignore file: Wrangler reads it and never uploads it. */
const ASSETS_IGNORE = ".assetsignore";

/**
 * @param {string[]} paths Files in out/, relative to it, with "/" between names.
 * @returns {string[]} Those that must not be there, in the order given.
 */
export function strayFiles(paths) {
  return paths.filter((path) => {
    if (path === ASSETS_IGNORE) {
      return false;
    }
    const names = path.split("/");
    return names.some((name) => name.startsWith(".")) || KEY_LIKE.test(names.at(-1) ?? "");
  });
}

/**
 * Every file under `dir`, relative to it, with "/" between names, and every
 * symbolic link, which Wrangler would follow and upload what it points to.
 * Every directory is entered, whatever its name; a link is listed, not
 * followed. Nothing for a directory that does not exist.
 *
 * @param {string} dir
 * @returns {{ files: string[], links: string[] }}
 */
export function listOutput(dir) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const links = [];
  /** @param {string} relative */
  const walk = (relative) => {
    let entries;
    try {
      entries = readdirSync(join(dir, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        links.push(path);
      } else if (entry.isDirectory()) {
        walk(path);
      } else {
        files.push(path);
      }
    }
  };
  walk("");
  return { files, links };
}

/**
 * A digest of every file under `dir`: its path, size and bytes, in path
 * order. Two folders with the same digest hold the same files. Throws for a
 * folder holding a symbolic link, which is never uploaded.
 *
 * @param {string} dir
 * @returns {string}
 */
export function outDigest(dir) {
  const { files, links } = listOutput(dir);
  if (links.length > 0) {
    throw new Error(`it holds symbolic links: ${links.join(", ")}`);
  }
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    const bytes = readFileSync(join(dir, file));
    hash.update(`${file}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

/**
 * What a beach page holds in place of its tide table when the build could
 * not get NOAA's predictions (src/components/BeachTideTable.tsx).
 */
export const TABLE_UNAVAILABLE = 'data-tide-table="unavailable"';

/**
 * The beach pages under `dir` (an export) that were built without their tide
 * table, as paths relative to it.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function pagesWithoutTable(dir) {
  const tides = join(dir, "tides");
  if (!existsSync(tides)) return [];
  return readdirSync(tides)
    .filter((name) => name.endsWith(".html"))
    .sort()
    .filter((name) => readFileSync(join(tides, name), "utf8").includes(TABLE_UNAVAILABLE))
    .map((name) => `tides/${name}`);
}

/** The free plan's static-asset limits, from Cloudflare's documentation on 2026-11-27. */
export const LIMITS = Object.freeze({ files: 20_000, bytesPerFile: 25 * 1024 * 1024, headerRules: 100 });

/** Files the configuration, the release checks and the service worker rely on. */
export const REQUIRED_FILES = Object.freeze([
  "index.html",
  "404.html",
  "_headers",
  ".assetsignore",
  "sw.js",
  "sitemap.xml",
  "robots.txt",
  "manifest.webmanifest",
]);

/**
 * Every problem with a static export, one sentence each: stray files, links,
 * missing files, a page the sitemap names that was not exported, and the free
 * plan's limits. Empty when the export can be uploaded.
 *
 * @param {object} build
 * @param {string[]} build.files Paths relative to out/.
 * @param {string[]} build.links Symbolic links relative to out/.
 * @param {(path: string) => number} build.size Bytes of one file.
 * @param {string} build.sitemap The exported sitemap.xml.
 * @param {string} build.headers The exported _headers.
 * @param {string} origin The site's address, as the sitemap names it.
 * @returns {string[]}
 */
export function buildProblems({ files, links, size, sitemap, headers }, origin) {
  /** @type {string[]} */
  const problems = [];
  for (const path of strayFiles(files)) {
    problems.push(`out/${path} must not be published: a dotfile or a private key`);
  }
  for (const path of links) {
    problems.push(`out/${path} is a symbolic link: Wrangler would upload what it points to`);
  }
  const present = new Set(files);
  for (const path of REQUIRED_FILES) {
    if (!present.has(path)) problems.push(`out/${path} is missing`);
  }
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = match[1] ?? "";
    if (!url.startsWith(`${origin}/`) && url !== origin) {
      problems.push(`the sitemap names ${url}, which is not on ${origin}`);
      continue;
    }
    const pathname = url.slice(origin.length).replace(/^\//, "");
    const page = pathname === "" ? "index.html" : `${pathname}.html`;
    if (!present.has(page)) problems.push(`the sitemap names ${url}, but out/${page} was not exported`);
  }
  if (files.length > LIMITS.files) {
    problems.push(`out/ holds ${files.length} files; the free plan allows ${LIMITS.files}`);
  }
  for (const path of files) {
    if (size(path) > LIMITS.bytesPerFile) problems.push(`out/${path} is over 25 MiB, the free plan's limit per file`);
  }
  const rules = headers.split("\n").filter((line) => line.trim() !== "" && !/^\s/.test(line) && !line.startsWith("#"));
  if (rules.length > LIMITS.headerRules) {
    problems.push(`_headers has ${rules.length} rules; Cloudflare applies at most ${LIMITS.headerRules}`);
  }
  return problems;
}
