import { describe, expect, test } from "vitest";
import { beachFaq, buildBeachWeek } from "@/lib/seo";
import { BEACHES } from "@/lib/slugs";
import predictions from "../fixtures/upstream/noaa-hilo-8651370.json";

/** NOAA's hi/lo answer as the app reads it. */
const extrema = predictions.predictions.map((p) => {
  const [date, time] = p.t.split(" ");
  const [y, mo, d] = date!.split("-").map(Number);
  const [h, mi] = time!.split(":").map(Number);
  return { time: Date.UTC(y!, mo! - 1, d!, h!, mi!), height: Number(p.v), type: p.type as "H" | "L" };
});

describe("the beach page's FAQ, which is baked into the static page", () => {
  const beach = BEACHES.find((candidate) => candidate.id === "8651370") ?? BEACHES[0]!;
  const week = buildBeachWeek(extrema, beach, extrema[2]!.time, 30);
  const faq = beachFaq(beach, week);
  const text = faq.map((item) => `${item.q} ${item.a}`).join("\n");

  test("states no time of day and no moon phase as today's: the page is up to a day old", () => {
    // The table above it is rebuilt in the browser for today; the FAQ is not, so it points there instead.
    expect(text).not.toMatch(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
    expect(text).not.toMatch(/currently|right now is|today \(/i);
    expect(text).not.toContain(week.days[0]!.label);
  });

  test("still answers the question people ask, from the table that is always today's", () => {
    const today = faq.find((item) => /today\?$/.test(item.q));
    expect(today?.q).toBe(`What time are high and low tide in ${beach.label} today?`);
    expect(today?.a).toContain("tide table on this page");
  });
});
