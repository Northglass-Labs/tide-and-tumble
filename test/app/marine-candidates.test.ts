import { describe, expect, test } from "vitest";
import { buoyCandidates } from "@/lib/marine";

describe("the NDBC stations asked for a beach", () => {
  test("include the nearest wave buoys, when the nearest stations are all fixed ones without wave sensors", () => {
    // Near Tampa the five nearest are fixed (C-MAN) stations; surf can only come from a buoy.
    const candidates = buoyCandidates(27.76, -82.63);
    expect(candidates.slice(0, 5).every((candidate) => !candidate.wave)).toBe(true);
    expect(candidates.filter((candidate) => candidate.wave).map((candidate) => candidate.id)).toEqual([
      "42098",
      "42013",
      "42022",
    ]);
    // Nearest first, each once.
    expect(candidates.map((candidate) => candidate.d)).toEqual([...candidates.map((candidate) => candidate.d)].sort((a, b) => a - b));
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(candidates.length);
  });

  test("ask for each station by its upper-case id, the name NDBC's files have", () => {
    for (const candidate of buoyCandidates(36.18, -75.75)) {
      expect(candidate.url).toBe(`https://www.ndbc.noaa.gov/data/realtime2/${candidate.id.toUpperCase()}.txt`);
    }
  });
});
