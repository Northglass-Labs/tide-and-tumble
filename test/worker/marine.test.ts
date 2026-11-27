import { describe, expect, it } from "vitest";
import buoy from "../fixtures/upstream/ndbc-44095.txt?raw";
import wind from "../fixtures/upstream/coops-wind-8651370.json";
import noWaterTemperature from "../fixtures/upstream/coops-wtemp-8651370.json";
import { NDBC, NOAA, json, stubUpstream, testApp, text } from "./helpers";

const MINUTE = 60_000;

interface MarineBody {
  waterTempF: number | null;
  windMph: number | null;
  windDir: string | null;
  windGustMph: number | null;
  surfFt: number | null;
  surfPeriodS: number | null;
  source: string | null;
}

/** NDBC answers every buoy with the fixture; CO-OPS has wind but no water temperature at the gauge. */
function upstreamsAnswer() {
  return stubUpstream([
    [NDBC, () => text(buoy)],
    [/[?&]product=wind(?:&|$)/, () => json(wind)],
    [/[?&]product=water_temperature(?:&|$)/, () => json(noWaterTemperature)],
  ]);
}

const buoysAsked = (calls: { url: URL }[]) =>
  calls.filter((call) => call.url.toString().startsWith(NDBC)).map((call) => call.url.pathname);

describe("GET /api/marine", () => {
  it("reads the nearest buoys and the tide gauge's wind, as the page showed before", async () => {
    const upstream = upstreamsAnswer();
    const t = testApp();
    const response = await t.request("/api/marine?station=8651370");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    const body = await response.json<MarineBody>();
    expect(body.surfFt).toBeCloseTo(2.8 * 3.28084, 6);
    expect(body.surfPeriodS).toBe(10);
    expect(body.waterTempF).toBeCloseTo((15.3 * 9) / 5 + 32, 6);
    expect(body.windMph).toBeCloseTo(20.6 * 1.15078, 6);
    expect(body.windDir).toBe("SW");
    expect(body.windGustMph).toBeCloseTo(28.96 * 1.15078, 6);
    expect(body.source).toMatch(/^NDBC \w+ · NOAA 8651370$/);

    expect(buoysAsked(upstream.calls).length).toBeGreaterThan(0);
    expect(buoysAsked(upstream.calls).length).toBeLessThanOrEqual(5);
    const gauge = upstream.calls.find((call) => call.url.searchParams.get("product") === "wind");
    expect(gauge?.url.toString().startsWith(NOAA)).toBe(true);
    expect(gauge?.url.searchParams.get("station")).toBe("8651370");
  });

  it("uses the station's own coordinates and ignores any sent with it", async () => {
    const plain = upstreamsAnswer();
    const t = testApp();
    await t.request("/api/marine?station=8651370");
    const expected = buoysAsked(plain.calls);
    plain.spy.mockRestore();

    const steered = upstreamsAnswer();
    const other = testApp();
    await other.request("/api/marine?station=8651370&lat=25.7617&lng=-80.1918");
    expect(buoysAsked(steered.calls)).toEqual(expected);
  });

  it("refuses a station outside the bundled list before asking anyone", async () => {
    const upstream = upstreamsAnswer();
    const t = testApp();
    for (const query of ["", "?lat=36.18&lng=-75.74", "?station=12345678"]) {
      const response = await t.request(`/api/marine${query}`);
      expect(response.status).toBe(400);
      expect(await response.json<{ error: string }>()).toMatchObject({ error: "invalid_station" });
    }
    expect(upstream.calls).toEqual([]);
  });

  it("answers from its cache for 10 minutes", async () => {
    const upstream = upstreamsAnswer();
    const t = testApp();
    const first = await (await t.request("/api/marine?station=8651370")).text();
    const calls = upstream.calls.length;
    t.clock.now += 9 * MINUTE;
    expect(await (await t.request("/api/marine?station=8651370")).text()).toBe(first);
    expect(upstream.calls.length).toBe(calls);

    t.clock.now += 2 * MINUTE;
    await t.request("/api/marine?station=8651370");
    expect(upstream.calls.length).toBeGreaterThan(calls);
  });

  it("keeps an answer with no readings for one minute only, so a failed upstream is retried soon", async () => {
    const upstream = stubUpstream([[/./, () => new Response("down", { status: 503 })]]);
    const t = testApp();
    const body = await (await t.request("/api/marine?station=8651370")).json<MarineBody>();
    expect(body).toEqual({
      waterTempF: null,
      windMph: null,
      windDir: null,
      windGustMph: null,
      surfFt: null,
      surfPeriodS: null,
      source: null,
    });
    const calls = upstream.calls.length;

    t.clock.now += 30_000;
    await t.request("/api/marine?station=8651370");
    expect(upstream.calls.length).toBe(calls);

    t.clock.now += 31_000;
    await t.request("/api/marine?station=8651370");
    expect(upstream.calls.length).toBeGreaterThan(calls);
  });
});
