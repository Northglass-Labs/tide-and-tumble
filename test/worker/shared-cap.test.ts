import { describe, expect, it } from "vitest";
import noaaStations from "../../src/lib/noaa-stations.json";
import predictions from "../fixtures/upstream/noaa-hilo-8651370.json";
import { json, NOAA, stubUpstream, testApp } from "./helpers";

/** Each route's cap of upstream calls per minute per instance (src/lib/api-guard.ts, POLICIES). */
const CAPS = { tides: 300, marine: 180, alerts: 240 } as const;

describe("the instance's shared cap of upstream calls", () => {
  it.each(Object.entries(CAPS))("answers /api/%s with 429 and Retry-After once it is used up", async (scope, cap) => {
    // NOAA answers tides; everything else is missing, which is quick and still asks upstream.
    stubUpstream([
      [NOAA, (url) => (url.searchParams.get("interval") === "hilo" ? json(predictions) : new Response("", { status: 404 }))],
      [/./, () => new Response("", { status: 404 })],
    ]);
    const t = testApp();
    const stations = noaaStations.slice(0, cap + 1).map((station) => station.i);
    let last: Response | undefined;
    for (const [index, station] of stations.entries()) {
      // Clients of 25 requests each, well under their own limits.
      last = await t.request(`/api/${scope}?station=${station}`, undefined, `203.0.113.${1 + Math.floor(index / 25)}`);
      if (index < cap) expect(last.status).toBe(200);
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
