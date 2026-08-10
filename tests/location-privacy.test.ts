import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("precise-location request privacy", () => {
  test("sends browser geolocation in a POST body rather than a URL", () => {
    const app = readFileSync("src/components/TideApp.tsx", "utf8");

    expect(app).not.toMatch(/\/api\/nearest\?lat=/);
    expect(app).toMatch(/fetch\("\/api\/nearest"\s*,\s*\{/);
    expect(app).toMatch(/method:\s*"POST"/);
  });

  test("privacy copy accurately describes hosting-provider processing", () => {
    const policy = readFileSync("src/app/privacy/page.tsx", "utf8");

    expect(policy).not.toMatch(/coordinates.+not stored or\s+logged/is);
    expect(policy).toMatch(/coordinates.+hosting provider/is);
    expect(policy).toMatch(/no-store|not retained in (?:a )?browser cache/i);
  });
});
