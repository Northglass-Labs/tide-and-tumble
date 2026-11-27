import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import beachZones from "@/lib/beach-zones.json";
import { expandUgc, parseSrf } from "@/lib/alerts";
import { BEACHES } from "@/lib/slugs";

const srf = (office: string) => readFileSync(new URL(`../fixtures/upstream/srf/${office}.txt`, import.meta.url), "utf8");

describe("the zone codes at the head of a forecast section", () => {
  test("carry the prefix to the numbers after it, and expand ranges", () => {
    expect(expandUgc("FLZ141-347-447-272100-")).toEqual(["FLZ141", "FLZ347", "FLZ447"]);
    expect(expandUgc("CAZ087>089-354-272345-")).toEqual(["CAZ087", "CAZ088", "CAZ089", "CAZ354"]);
    expect(expandUgc("FLZ050-151-AMZ555-272115-")).toEqual(["FLZ050", "FLZ151", "AMZ555"]);
  });
});

describe("a beach's section of its office's Surf Zone Forecast (real forecasts, 2026-11-27)", () => {
  test.each([
    ["MLB", "FLZ447", "Cocoa Beach, where Melbourne's forecast lists the zone after its prefix"],
    ["TBW", "FLZ050", "Clearwater Beach, by its land zone rather than the pier's marine one"],
    ["MFL", "FLZ173", "Miami Beach"],
  ])("is found in %s's forecast for %s (%s)", (office, zone) => {
    const section = parseSrf(srf(office), zone);
    expect(section.found).toBe(true);
    expect(section.rip).toMatch(/^(Low|Moderate|High)$/);
  });

  test("is not found when the forecast has no section for the zone, and then says nothing", () => {
    // Los Angeles' forecast has no section for Santa Monica's land zone.
    expect(parseSrf(srf("LOX"), "CAZ366")).toEqual({ found: false, rip: null, uv: null });
  });
});

describe("each curated beach's land forecast zone (src/lib/beach-zones.json)", () => {
  test("is bundled for every curated beach, and is a land zone, never a marine one", () => {
    for (const beach of BEACHES) {
      expect((beachZones as Record<string, string>)[beach.id], beach.label).toMatch(/^[A-Z]{2}Z\d{3}$/);
      expect((beachZones as Record<string, string>)[beach.id]).not.toMatch(/^(AM|AN|GM|PZ|PK|PH|LM|LE|LH|LO|LS|SL|PM|PS)Z/);
    }
  });
});
