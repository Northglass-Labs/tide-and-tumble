import { describe, expect, it } from "vitest";
import { NWS, json, stubUpstream, testApp } from "./helpers";

const MINUTE = 60_000;
const USER_AGENT = "TideAndTumble/1.0 (tideandtumble.app, hello@northglass.io)";
const PRODUCT = "https://api.weather.gov/products/00000000-srf-example";

interface SafetyBody {
  alerts: { id: string; event: string; severity: string; summary: string }[];
  ripRisk: string | null;
  uvIndex: string | null;
  source: string | null;
  complete: boolean;
  ripForecast: "today" | "none" | "not-yet" | "out-of-season" | null;
}

const point = json({
  properties: {
    gridId: "MHX",
    forecastZone: "https://api.weather.gov/zones/forecast/NCZ203",
    timeZone: "America/New_York",
  },
});
/** The office's Surf Zone Forecasts, newest first: today's, issued at 03:47 local time (the test clock is 10:00). */
const TODAY_SRF = { "@graph": [{ "@id": PRODUCT, issuanceTime: "2026-11-27T08:47:00+00:00" }] };
const statement = {
  id: "https://api.weather.gov/alerts/example-rip-current",
  properties: {
    event: "Rip Current Statement",
    severity: "Moderate",
    description: "* WHAT...Dangerous rip currents. * WHERE...Dare County beaches.",
  },
};
const gale = { id: "https://api.weather.gov/alerts/example-gale", properties: { event: "Gale Warning", severity: "Moderate" } };
const srf = (risk: string) =>
  json({
    productText:
      "SURF ZONE FORECAST\n\nNCZ203-281200-\nNorthern Outer Banks-\n\n.TODAY...\n" +
      `Rip Current Risk*..........${risk}.\nUV Index**..................Low.\n\n$$\n`,
  });

/** NWS answering the point, its alerts, the office's Surf Zone Forecast list and the forecast. */
function nwsAnswers({ alerts = [statement, gale], risk = "High" }: { alerts?: unknown[]; risk?: string } = {}) {
  return stubUpstream([
    [`${NWS}points/`, () => point.clone()],
    [`${NWS}alerts/active`, () => json({ features: alerts })],
    [`${NWS}products/types/SRF/locations/MHX`, () => json(TODAY_SRF)],
    [PRODUCT, () => srf(risk)],
  ]);
}

describe("GET /api/alerts", () => {
  it("asks NWS about the station's own point, saying who is asking", async () => {
    const upstream = nwsAnswers();
    const t = testApp();
    const response = await t.request("/api/alerts?station=8651370&lat=25.76&lng=-80.19");

    expect(response.status).toBe(200);
    const [points, active] = upstream.calls;
    expect(points?.url.toString()).toBe(`${NWS}points/36.1833,-75.7467`);
    expect(active?.url.toString()).toBe(`${NWS}alerts/active?point=36.1833,-75.7467&status=actual`);
    for (const call of upstream.calls) {
      expect(call.headers.get("User-Agent")).toBe(USER_AGENT);
    }
  });

  it("answers the beach alerts, the rip-current risk, the UV index and whether NWS answered in full", async () => {
    nwsAnswers();
    const t = testApp();
    const response = await t.request("/api/alerts?station=8651370");

    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    const body = await response.json<SafetyBody>();
    expect(Object.keys(body).sort()).toEqual(["alerts", "complete", "ripForecast", "ripRisk", "source", "uvIndex"]);
    expect(body.ripForecast).toBe("today");
    expect(body.complete).toBe(true);
    expect(body.ripRisk).toBe("High");
    expect(body.uvIndex).toBe("Low");
    expect(body.source).toBe("NWS (MHX)");
    expect(body.alerts.map((alert) => alert.event)).toEqual(["Rip Current Statement"]);
  });

  it("turns a moderate rip-current risk without a formal statement into an advisory", async () => {
    nwsAnswers({ alerts: [], risk: "Moderate" });
    const t = testApp();
    const body = await (await t.request("/api/alerts?station=8651370")).json<SafetyBody>();
    expect(body.alerts).toEqual([
      expect.objectContaining({ id: "rip-risk", event: "Moderate Rip Current Risk", severity: "Moderate" }),
    ]);
  });

  it("refuses a station outside the bundled list before asking NWS", async () => {
    const upstream = nwsAnswers();
    const t = testApp();
    for (const query of ["", "?lat=36.18&lng=-75.74", "?station=00000000"]) {
      const response = await t.request(`/api/alerts${query}`);
      expect(response.status).toBe(400);
      expect(await response.json<{ error: string }>()).toMatchObject({ error: "invalid_station" });
    }
    expect(upstream.calls).toEqual([]);
  });

  it("answers from its cache for 15 minutes once NWS has answered in full, then asks NWS before answering", async () => {
    let risk = "High";
    const upstream = stubUpstream([
      [`${NWS}points/`, () => point.clone()],
      [`${NWS}alerts/active`, () => json({ features: [] })],
      [`${NWS}products/types/SRF/locations/MHX`, () => json(TODAY_SRF)],
      [PRODUCT, () => srf(risk)],
    ]);
    const t = testApp();
    expect((await (await t.request("/api/alerts?station=8651370")).json<SafetyBody>()).ripRisk).toBe("High");
    const calls = upstream.calls.length;

    risk = "Low";
    t.clock.now += 14 * MINUTE;
    expect((await (await t.request("/api/alerts?station=8651370")).json<SafetyBody>()).ripRisk).toBe("High");
    expect(upstream.calls.length).toBe(calls);

    // Never served stale: after 15 minutes the answer is NWS's new one, not the kept one.
    t.clock.now += 2 * MINUTE;
    expect((await (await t.request("/api/alerts?station=8651370")).json<SafetyBody>()).ripRisk).toBe("Low");
    await t.settle();
    expect(upstream.calls.length).toBe(calls * 2);
  });

  it("says when NWS did not answer in full, so the page can never take a failed lookup for no warnings", async () => {
    let alertsUp = false;
    const upstream = stubUpstream([
      [`${NWS}points/`, () => point.clone()],
      [`${NWS}alerts/active`, () => (alertsUp ? json({ features: [statement] }) : new Response("", { status: 500 }))],
      [`${NWS}products/types/SRF/locations/MHX`, () => json({ "@graph": [] })],
    ]);
    const t = testApp();
    const partial = await (await t.request("/api/alerts?station=8651370")).json<SafetyBody>();
    expect(partial).toMatchObject({ alerts: [], complete: false });

    // An incomplete answer is kept for one minute only, and keeps saying it is incomplete.
    alertsUp = true;
    const calls = upstream.calls.length;
    t.clock.now += 30_000;
    const kept = await (await t.request("/api/alerts?station=8651370")).json<SafetyBody>();
    expect(kept).toMatchObject({ alerts: [], complete: false });
    expect(upstream.calls.length).toBe(calls);

    t.clock.now += 31_000;
    const recovered = await (await t.request("/api/alerts?station=8651370")).json<SafetyBody>();
    expect(upstream.calls.length).toBeGreaterThan(calls);
    expect(recovered.complete).toBe(true);
    expect(recovered.alerts.map((alert) => alert.event)).toEqual(["Rip Current Statement"]);
  });

  it("never shows an old Surf Zone Forecast's rip-current risk as today's", async () => {
    // An office that stops issuing for the season leaves its last forecast listed for about a week.
    for (const [issuanceTime, ripForecast] of [
      ["2026-11-20T08:47:00+00:00", "out-of-season"],
      ["2026-11-27T04:30:00+00:00", "not-yet"],
      [undefined, null],
    ] as const) {
      // 04:30 UTC is 23:30 on the 26th at the beach: yesterday's forecast, though the same UTC date.
      const upstream = stubUpstream([
        [`${NWS}points/`, () => point.clone()],
        [`${NWS}alerts/active`, () => json({ features: [] })],
        [`${NWS}products/types/SRF/locations/MHX`, () => json({ "@graph": [{ "@id": PRODUCT, issuanceTime }] })],
        [PRODUCT, () => srf("High")],
      ]);
      const t = testApp();
      const body = await (await t.request("/api/alerts?station=8651370")).json<SafetyBody>();
      // Said, not left blank: a forecast not issued yet today, or none issued lately (out of season).
      expect(body).toMatchObject({ alerts: [], ripRisk: null, uvIndex: null, complete: true, ripForecast });
      expect(upstream.calls.some((call) => call.url.toString() === PRODUCT)).toBe(false);
      upstream.spy.mockRestore();
    }
  });

  it("says no rip-current forecast is being issued when the office lists none", async () => {
    stubUpstream([
      [`${NWS}points/`, () => point.clone()],
      [`${NWS}alerts/active`, () => json({ features: [] })],
      [`${NWS}products/types/SRF/locations/MHX`, () => json({ "@graph": [] })],
    ]);
    const body = await (await testApp().request("/api/alerts?station=8651370")).json<SafetyBody>();
    expect(body).toMatchObject({ ripRisk: null, ripForecast: "out-of-season", complete: true });
  });

  it("says today's forecast speaks for the beach only when its own zone gives a rip-current risk", async () => {
    const answer = async (productText: string) => {
      stubUpstream([
        [`${NWS}points/`, () => point.clone()],
        [`${NWS}alerts/active`, () => json({ features: [] })],
        [`${NWS}products/types/SRF/locations/MHX`, () => json(TODAY_SRF)],
        [PRODUCT, () => json({ productText })],
      ]);
      return (await testApp().request("/api/alerts?station=8651370")).json<SafetyBody>();
    };
    // A Low risk is a forecast too: it is said, not left blank.
    expect(await answer("NCZ203-280700-\n.TODAY...\nRip Current Risk*..........Low.\n$$\n")).toMatchObject({
      ripRisk: "Low",
      ripForecast: "today",
    });
    // Today's forecast has the beach's own section, and it gives no rip-current risk.
    expect(await answer("NCZ203-280700-\n.TODAY...\nSurf Height.................2 to 3 feet.\n$$\n")).toMatchObject({
      ripRisk: null,
      ripForecast: "none",
    });
  });

  it("says nothing about rip currents when today's forecast has no section for the beach", async () => {
    stubUpstream([
      [`${NWS}points/`, () => point.clone()],
      [`${NWS}alerts/active`, () => json({ features: [] })],
      [`${NWS}products/types/SRF/locations/MHX`, () => json(TODAY_SRF)],
      [PRODUCT, () => json({ productText: "NCZ999-280700-\n.TODAY...\nRip Current Risk*..........High.\n$$\n" })],
    ]);
    const body = await (await testApp().request("/api/alerts?station=8651370")).json<SafetyBody>();
    expect(body).toMatchObject({ ripRisk: null, ripForecast: null, complete: true });
  });

  it("asks for alerts by the beach's land zone as well as by its point, which may be on the water", async () => {
    const zoneAdvisory = { id: "https://api.weather.gov/alerts/example-beach-hazards", properties: { event: "Beach Hazards Statement", severity: "Moderate" } };
    const upstream = stubUpstream([
      [`${NWS}points/`, () => point.clone()],
      [`${NWS}alerts/active?point=`, () => json({ features: [] })],
      [`${NWS}alerts/active?zone=NCZ203`, () => json({ features: [zoneAdvisory] })],
      [`${NWS}products/types/SRF/locations/MHX`, () => json(TODAY_SRF)],
      [PRODUCT, () => srf("Low")],
    ]);
    const body = await (await testApp().request("/api/alerts?station=8651370")).json<SafetyBody>();
    expect(body.alerts.map((alert) => alert.event)).toContain("Beach Hazards Statement");
    expect(upstream.calls.some((call) => call.url.toString().includes("alerts/active?zone=NCZ203"))).toBe(true);
  });
});

