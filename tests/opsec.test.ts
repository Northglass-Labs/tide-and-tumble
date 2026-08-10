import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("public-release OPSEC boundary", () => {
  test("keeps operator infrastructure and internal notes out of the public tree", () => {
    const deployment = read("DEPLOYMENT.md");
    const assistantGuide = read("CLAUDE.md");
    const publicText = deployment + "\n" + assistantGuide;

    expect(publicText).not.toMatch(
      /(?:team\s*\/\s*scope|[a-z0-9-]+\.ns\.[a-z]+\.com|1password|homelab|authorization:\s*bearer|repoid|personal account)/i,
    );
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
