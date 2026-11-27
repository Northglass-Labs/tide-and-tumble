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

  test("is not found by a code alone when the office heads the section with another", () => {
    expect(parseSrf(srf("LOX"), "CAZ366")).toEqual({ found: false, rip: null, uv: null });
  });
});

const zones = beachZones as Record<string, { zone: string; office: string; name: string }>;
const issuedToday = (office: string) => {
  try {
    return srf(office).length > 0;
  } catch {
    return false;
  }
};

describe("each curated beach's land forecast zone, its name and its office (src/lib/beach-zones.json)", () => {
  test("is bundled for every curated beach: a land zone, never a marine one, with its office", () => {
    for (const beach of BEACHES) {
      const entry = zones[beach.id]!;
      expect(entry.zone, beach.label).toMatch(/^[A-Z]{2}Z\d{3}$/);
      expect(entry.zone).not.toMatch(/^(AM|AN|GM|PZ|PK|PH|LM|LE|LH|LO|LS|SL|PM|PS)Z/);
      expect(entry.office, beach.label).toMatch(/^[A-Z]{3}$/);
      expect(entry.name.length, beach.label).toBeGreaterThan(2);
    }
  });

  test.each([
    ["8725520", "FLZ165", "TBW", "Coastal Lee"],
    ["9414290", "CAZ509", "MTR", "San Francisco Peninsula Coast"],
    ["8771341", "TXZ438", "HGX", "Galveston Island"],
    ["9410580", "CAZ552", "SGX", "Orange County Coastal"],
    ["9410660", "CAZ366", "LOX", "Los Angeles County Beaches"],
  ])("%s is %s (%s, %s), as api.weather.gov's zones give it", (id, zone, office, name) => {
    expect(zones[id]).toEqual({ zone, office, name });
  });

  test("every curated beach in an office that issued today's forecast finds its section (forecasts recorded 2026-11-27)", () => {
    const missing = BEACHES.filter((beach) => issuedToday(zones[beach.id]!.office))
      .filter((beach) => !parseSrf(srf(zones[beach.id]!.office), zones[beach.id]!.zone, zones[beach.id]!.name).found)
      .map((beach) => `${beach.label} (${zones[beach.id]!.office} ${zones[beach.id]!.zone} ${zones[beach.id]!.name})`);
    expect(missing).toEqual([]);
  });
});

describe("Boston's form, the level on lines below the label, one per stretch of coast", () => {
  test.each(["8447435", "8446121", "8449130"])("gives %s its highest level (Chatham, Provincetown, Nantucket: High)", (id) => {
    const { zone, name } = zones[id]!;
    expect(parseSrf(srf("BOX"), zone, name)).toMatchObject({ found: true, rip: "High" });
  });
});

describe("a section found by its zone's name when the office uses another code", () => {
  test("Los Angeles County Beaches (CAZ366) in Los Angeles' section headed CAZ362-364", () => {
    expect(parseSrf(srf("LOX"), "CAZ366", "Los Angeles County Beaches").found).toBe(true);
  });
});
