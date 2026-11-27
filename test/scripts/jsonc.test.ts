import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJsonc } from "../../scripts/lib/jsonc.mjs";
import { readProject } from "../../scripts/lib/project.mjs";

describe("parseJsonc()", () => {
  it("ignores line and block comments", () => {
    const text = `{
      // a line comment
      "a": 1, /* a block
      comment */ "b": [2, 3]
    }`;

    expect(parseJsonc(text)).toEqual({ a: 1, b: [2, 3] });
  });

  it("leaves what looks like a comment inside a string alone", () => {
    const text = '{ "url": "https://example.com/a//b", "note": "not /* a */ comment", "quote": "say \\"hi\\" // ok" }';

    expect(parseJsonc(text)).toEqual({
      url: "https://example.com/a//b",
      note: "not /* a */ comment",
      quote: 'say "hi" // ok',
    });
  });

  it("allows a comma before a closing bracket, even with a comment in between", () => {
    const text = `{
      "list": [1, 2,],
      "last": true, // trailing
    }`;

    expect(parseJsonc(text)).toEqual({ list: [1, 2], last: true });
  });

  it("still refuses text that is not JSON", () => {
    expect(() => parseJsonc("{ a: 1 }")).toThrow();
  });
});

describe("readProject()", () => {
  it("reads this repository's own wrangler.jsonc", () => {
    const root = new URL("../../", import.meta.url);
    const packageName = (JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as { name: string }).name;

    const project = readProject(root);

    expect(project.worker).toBe(packageName);
    expect(project.origin).toBe("https://tideandtumble.app");
  });
});
