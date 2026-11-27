import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);

describe("vercel.json, which keeps the previous host from deploying", () => {
  it("turns its automatic Git deployments off for every branch, and says nothing else", () => {
    // The previous host reads this file from each pushed commit; any other key could deploy, route or alias.
    expect(JSON.parse(readFileSync(new URL("vercel.json", ROOT), "utf8"))).toStrictEqual({
      $schema: "https://openapi.vercel.sh/vercel.json",
      git: { deploymentEnabled: false },
    });
  });

  it("stays at the repository root, out of the static export and so out of every upload", () => {
    // Only public/ is copied into out/, which is all Wrangler uploads and npm run check reads.
    expect(existsSync(new URL("public/vercel.json", ROOT))).toBe(false);
    expect(existsSync(new URL("out/vercel.json", ROOT))).toBe(false);
  });
});
