import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const has = (path: string) => existsSync(join(root, path));

describe("Northglass brand contract", () => {
  test("uses the approved sun-and-three-waves glyph as the only favicon", () => {
    expect(has("src/app/favicon.ico")).toBe(false);
    expect(has("src/app/icon.svg")).toBe(true);

    const icon = read("src/app/icon.svg");
    expect(icon).toMatch(/<circle cx="17\.5" cy="6" r="2"[^>]+opacity="0\.55"/);
    expect(icon).toMatch(/M2\.5 10 Q5\.5 7 8\.5 10 T14\.5 10 T20\.5 10[^>]+opacity="0\.75"/);
    expect(icon).toMatch(/M2\.5 14 Q5\.5 11 8\.5 14 T14\.5 14 T20\.5 14[^>]+opacity="0\.5"/);
    expect(icon).toMatch(/M2\.5 18 Q5\.5 15 8\.5 18 T14\.5 18 T20\.5 18[^>]+opacity="0\.3"/);

    expect(read("src/app/layout.tsx")).toMatch(/icon:\s*"\/icon\.svg"/);
    expect(read("src/app/manifest.ts")).toMatch(/src:\s*"\/icon\.svg"/);
  });

  test("uses the current Northglass endorsement and legal naming", () => {
    expect(read("src/components/Footer.tsx")).toMatch(/a Northglass Product/);
    expect(read("README.md")).toMatch(
      /\[a Northglass Product\]\(https:\/\/northglass\.io\)/,
    );

    const publicCopy = [
      "README.md",
      "AUTHORS",
      "LICENSE",
      "package.json",
      "src/components/Footer.tsx",
      "src/app/privacy/page.tsx",
    ]
      .map(read)
      .join("\n");

    // `Northglass Labs` is the retired customer-facing name; the public parent
    // name is `Northglass` and the legal entity is `Northglass LLC`.
    expect(publicCopy).not.toMatch(/Northglass Labs/);
    expect(publicCopy).toMatch(/Northglass LLC/);
  });

  test("preserves Tide and Tumble's intentional expressive type system", () => {
    expect(read("src/app/layout.tsx")).toMatch(/Fredoka, Nunito, Pacifico/);

    const css = read("src/app/globals.css");
    expect(css).toMatch(/--font-display:\s*var\(--font-fredoka\)/);
    expect(css).toMatch(/--font-body:\s*var\(--font-nunito\)/);
    expect(css).toMatch(/--font-brand:\s*var\(--font-pacifico\)/);

    const readme = read("README.md");
    expect(readme).toMatch(/Fredoka · Nunito · Pacifico/);
    expect(readme).toMatch(/a Northglass Product/);
  });
});
