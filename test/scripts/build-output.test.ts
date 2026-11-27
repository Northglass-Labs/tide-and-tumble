import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProblems,
  LIMITS,
  listOutput,
  outDigest,
  pagesWithoutTable,
  REQUIRED_FILES,
  strayFiles,
  TABLE_UNAVAILABLE,
} from "../../scripts/lib/build-output.mjs";

const ORIGIN = "https://tideandtumble.app";
const SITEMAP = `<urlset><url><loc>${ORIGIN}</loc></url><url><loc>${ORIGIN}/tides/nags-head</loc></url></urlset>`;
const good = () => ({
  files: [...REQUIRED_FILES, "tides/nags-head.html", "_next/static/chunks/a.js"],
  links: [] as string[],
  size: () => 1_000,
  sitemap: SITEMAP,
  headers: "/*\n  X-Content-Type-Options: nosniff\n",
});

describe("strayFiles()", () => {
  it("names every dotfile and key-like file in the export, wherever it is", () => {
    const canaries = [
      ".env",
      ".git/config",
      ".DS_Store",
      "audio/.hidden",
      ".well-known/canary.txt",
      "keys/server.pem",
      "tls.key",
      "deploy/id_ed25519",
      "AuthKey_ABC123.p8",
      "release.jks",
    ];
    expect(strayFiles([...canaries, "index.html", "_next/static/chunks/a.js", "_headers"])).toEqual(canaries);
  });

  it("allows the export's own .assetsignore, which Wrangler reads and never uploads", () => {
    expect(strayFiles([".assetsignore", "_headers", "icon.svg"])).toEqual([]);
    expect(strayFiles(["nested/.assetsignore"])).toEqual(["nested/.assetsignore"]);
  });
});

describe("listOutput()", () => {
  it("lists every file, dotfiles and nested ones included, and every symbolic link without following it", () => {
    const dir = mkdtempSync(join(tmpdir(), "build-output-"));
    mkdirSync(join(dir, ".git"), { recursive: true });
    mkdirSync(join(dir, "tides"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<main></main>");
    writeFileSync(join(dir, ".env"), "canary");
    writeFileSync(join(dir, ".git", "config"), "canary");
    writeFileSync(join(dir, "tides", "nags-head.html"), "");
    symlinkSync("/etc/hosts", join(dir, "hosts.txt"));

    const output = listOutput(dir);
    expect(output.files.sort()).toEqual([".env", ".git/config", "index.html", "tides/nags-head.html"]);
    expect(output.links).toEqual(["hosts.txt"]);
  });

  it("lists nothing for a directory that does not exist", () => {
    expect(listOutput(join(tmpdir(), "no-such-build-output-dir"))).toEqual({ files: [], links: [] });
  });
});

describe("outDigest()", () => {
  const exportWith = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "tnt-digest-"));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return dir;
  };

  it("is the same for two folders holding the same files, and changes with any name or byte", () => {
    const files = { "index.html": "<p>tides</p>", "tides/duck.html": "<table></table>" };
    const digest = outDigest(exportWith(files));
    expect(outDigest(exportWith(files))).toBe(digest);
    expect(outDigest(exportWith({ ...files, "tides/duck.html": "<table> </table>" }))).not.toBe(digest);
    expect(outDigest(exportWith({ "index.html": "<p>tides</p>", "tides/corolla.html": "<table></table>" }))).not.toBe(digest);
    expect(outDigest(exportWith({ ...files, ".env": "" }))).not.toBe(digest);
  });

  it("refuses a folder holding a symbolic link", () => {
    const dir = exportWith({ "index.html": "" });
    symlinkSync("/etc/hosts", join(dir, "hosts"));
    expect(() => outDigest(dir)).toThrow("symbolic links: hosts");
  });
});

describe("pagesWithoutTable()", () => {
  it("names the beach pages built without their tide table, and nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), "tnt-tables-"));
    mkdirSync(join(dir, "tides"));
    writeFileSync(join(dir, "tides", "duck.html"), "<table><tr><td>High 6:12 AM</td></tr></table>");
    writeFileSync(join(dir, "tides", "nags-head.html"), `<p ${TABLE_UNAVAILABLE}>The live tide table is unavailable</p>`);
    writeFileSync(join(dir, "index.html"), `<p ${TABLE_UNAVAILABLE}></p>`);
    expect(pagesWithoutTable(dir)).toEqual(["tides/nags-head.html"]);
    expect(pagesWithoutTable(join(dir, "missing"))).toEqual([]);
  });
});

describe("buildProblems()", () => {
  it("passes an export that can be uploaded", () => {
    expect(buildProblems(good(), ORIGIN)).toEqual([]);
  });

  it("refuses stray files, symbolic links and missing files", () => {
    const problems = buildProblems(
      { ...good(), files: [...good().files.filter((path) => path !== "_headers"), ".env"], links: ["hosts.txt"] },
      ORIGIN,
    );
    expect(problems).toEqual([
      "out/.env must not be published: a dotfile or a private key",
      "out/hosts.txt is a symbolic link: Wrangler would upload what it points to",
      "out/_headers is missing",
    ]);
  });

  it("refuses an export missing a page the sitemap names, or a sitemap naming another site", () => {
    const sitemap = SITEMAP.replace("</urlset>", `<url><loc>${ORIGIN}/tides/duck</loc></url><url><loc>https://elsewhere.example/x</loc></url></urlset>`);
    expect(buildProblems({ ...good(), sitemap }, ORIGIN)).toEqual([
      `the sitemap names ${ORIGIN}/tides/duck, but out/tides/duck.html was not exported`,
      "the sitemap names https://elsewhere.example/x, which is not on https://tideandtumble.app",
    ]);
  });

  it("holds the export to the free plan's limits", () => {
    const many = Array.from({ length: LIMITS.files }, (_, index) => `f/${index}.txt`);
    const problems = buildProblems(
      {
        ...good(),
        files: [...good().files, ...many],
        size: (path: string) => (path === "_next/static/chunks/a.js" ? 26 * 1024 * 1024 : 1),
        headers: Array.from({ length: 101 }, (_, index) => `/r${index}\n  X-A: 1`).join("\n"),
      },
      ORIGIN,
    );
    expect(problems).toEqual([
      `out/ holds ${LIMITS.files + good().files.length} files; the free plan allows 20000`,
      "out/_next/static/chunks/a.js is over 25 MiB, the free plan's limit per file",
      "_headers has 101 rules; Cloudflare applies at most 100",
    ]);
  });
});

describe("public/.assetsignore", () => {
  it("keeps dotfiles and private keys out of the upload, even if they reach the export", () => {
    const lines = readFileSync(new URL("../../public/.assetsignore", import.meta.url), "utf8").split("\n");
    for (const pattern of [".*", "*.pem", "*.key", "*.p8", "id_ed25519"]) {
      expect(lines).toContain(pattern);
    }
  });
});
