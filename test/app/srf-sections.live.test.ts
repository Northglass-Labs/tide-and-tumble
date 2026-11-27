import { describe, expect, test } from "vitest";
import beachZones from "@/lib/beach-zones.json";
import { parseSrf } from "@/lib/alerts";
import { BEACHES } from "@/lib/slugs";

// The live form of srf-zones.test.ts's check: against today's forecasts, every curated beach in an office that
// issued one today finds its section. It asks api.weather.gov, so it runs only when asked:
//   LIVE_SRF=1 npx vitest run --project app test/app/srf-sections.live.test.ts
const zones = beachZones as Record<string, { zone: string; office: string; name: string }>;
const UA = "tide-and-tumble section check (https://tideandtumble.app, hello@northglass.io)";
const json = async (url: string) => (await fetch(url, { headers: { "User-Agent": UA } })).json();

describe.skipIf(!process.env.LIVE_SRF)("today's Surf Zone Forecasts, live", () => {
  test("every in-season curated beach finds its section", { timeout: 120_000 }, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const texts = new Map<string, string | null>();
    for (const office of new Set(Object.values(zones).map((entry) => entry.office))) {
      const newest = (await json(`https://api.weather.gov/products/types/SRF/locations/${office}`))["@graph"]?.[0];
      const fresh = newest && String(newest.issuanceTime).slice(0, 10) >= today;
      texts.set(office, fresh ? String((await json(newest["@id"])).productText ?? "") : null);
    }
    const inSeason = BEACHES.filter((beach) => texts.get(zones[beach.id]!.office));
    const missing = inSeason
      .filter((beach) => !parseSrf(texts.get(zones[beach.id]!.office)!, zones[beach.id]!.zone, zones[beach.id]!.name).found)
      .map((beach) => `${beach.label} (${zones[beach.id]!.office} ${zones[beach.id]!.zone})`);
    console.log(`${inSeason.length - missing.length} of ${inSeason.length} in-season beaches find their section`);
    expect(missing).toEqual([]);
  });
});
