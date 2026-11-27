import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("precise-location privacy", () => {
  test("finds the nearest station on the device, so geolocation never leaves it", () => {
    for (const file of ["src/components/TideApp.tsx", "src/components/BeachPicker.tsx"]) {
      const source = read(file);
      expect(source).not.toMatch(/\/api\/nearest/);
      expect(source).toMatch(/await import\("@\/lib\/nearest"\)/);
    }
    // The station list is loaded on demand, never part of the first page load.
    for (const file of ["src/components/TideApp.tsx", "src/components/BeachPicker.tsx"]) {
      expect(read(file)).not.toMatch(/^import[^;]*["']@\/lib\/nearest["']/m);
    }
  });

  test("asks the API for beach data by station id, never by coordinates", () => {
    const app = read("src/components/TideApp.tsx");
    for (const route of ["tides", "marine", "alerts"]) {
      const calls = [...app.matchAll(new RegExp(`/api/${route}\\?[^\`"']*`, "g"))].map((match) => match[0]);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call).toMatch(/^\/api\/\w+\?station=/);
        expect(call).not.toMatch(/lat=|lng=/);
      }
    }
  });

  test("privacy copy says where location goes and who hosts the app", () => {
    const policy = read("src/app/privacy/page.tsx");

    // `[\s\S]` rather than `.` with the `s` flag: dotAll needs an ES2018 target
    // and tsconfig targets ES2017, so the build's type-check rejects it.
    expect(policy).toMatch(/coordinates[\s\S]+never leave your device/i);
    expect(policy).not.toMatch(/sent once in a protected request body/i);
    expect(policy).toMatch(/Cloudflare/);
    expect(policy).not.toMatch(/Vercel/);
  });
});
