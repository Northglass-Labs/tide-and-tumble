import { describe, expect, it } from "vitest";
import predictions from "../fixtures/upstream/noaa-hilo-8651370.json";
import { CLIENT, NOAA, json, stubUpstream, testApp } from "./helpers";

const MINUTE = 60_000;

interface TidesBody {
  station: Record<string, unknown>;
  extrema: { time: number; height: number; type: string }[];
}

const noaaAnswers = () => stubUpstream([[NOAA, () => json(predictions)]]);

describe("GET /api/tides", () => {
  it("asks NOAA for the station's hi/lo predictions from yesterday to a month ahead", async () => {
    const upstream = noaaAnswers();
    const t = testApp();
    const response = await t.request("/api/tides?station=8651370-duck");

    expect(response.status).toBe(200);
    expect(upstream.calls).toHaveLength(1);
    const url = upstream.calls[0]!.url;
    expect(url.searchParams.get("station")).toBe("8651370");
    expect(url.searchParams.get("begin_date")).toBe("20261126");
    expect(url.searchParams.get("end_date")).toBe("20261228");
    expect(url.searchParams.get("interval")).toBe("hilo");
    expect(url.searchParams.get("time_zone")).toBe("lst_ldt");
    expect(url.searchParams.get("datum")).toBe("MLLW");
    expect(url.searchParams.get("application")).toBe("obx-tides");
  });

  it("answers the curated station and the sorted extrema, cacheable at the edge as before", async () => {
    noaaAnswers();
    const t = testApp();
    const response = await t.request("/api/tides?station=8651370-DUCK");

    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=900, stale-while-revalidate=3600");
    const body = await response.json<TidesBody>();
    expect(body.station).toEqual({
      id: "8651370-duck",
      label: "Duck",
      stationName: "Duck Pier",
      lat: 36.1833,
      lng: -75.7467,
      type: "R",
      exposure: "ocean",
    });
    expect(body.extrema.length).toBe(predictions.predictions.length);
    expect(body.extrema[0]).toEqual({ time: Date.UTC(2026, 10, 26, 1, 39), height: -0.357, type: "L" });
    const times = body.extrema.map((extremum) => extremum.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("names an uncurated NOAA station by its id", async () => {
    noaaAnswers();
    const t = testApp();
    const body = await (await t.request("/api/tides?station=8410140")).json<TidesBody>();
    expect(body.station).toEqual({ id: "8410140", noaaId: "8410140" });
  });

  it("refuses a station outside the bundled list before asking NOAA", async () => {
    const upstream = noaaAnswers();
    const t = testApp();
    for (const query of ["", "?station=99999999", "?station=8651370-invented", "?station=..%2F..%2Fx"]) {
      const response = await t.request(`/api/tides${query}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid_station",
        message: "That is not a NOAA tide station this app knows.",
      });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    }
    expect(upstream.calls).toEqual([]);
  });

  it("answers from its cache for 15 minutes without asking NOAA again", async () => {
    const upstream = noaaAnswers();
    const t = testApp();
    const first = await (await t.request("/api/tides?station=8651370")).text();
    t.clock.now += 14 * MINUTE;
    const second = await (await t.request("/api/tides?station=8651370")).text();

    expect(second).toBe(first);
    expect(upstream.calls).toHaveLength(1);
  });

  it("serves a stale answer at once for up to an hour while one refresh runs behind it", async () => {
    const upstream = noaaAnswers();
    const t = testApp();
    await t.request("/api/tides?station=8651370");
    await t.settle();
    t.clock.now += 20 * MINUTE;

    const stale = await t.request("/api/tides?station=8651370");
    expect(stale.status).toBe(200);
    await t.settle();
    expect(upstream.calls).toHaveLength(2);

    // The refresh replaced the entry: fresh again, no further call.
    t.clock.now += MINUTE;
    await t.request("/api/tides?station=8651370");
    await t.settle();
    expect(upstream.calls).toHaveLength(2);
  });

  it("runs one refresh per station however many requests arrive while it runs", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const upstream = stubUpstream([
      [
        NOAA,
        async () => {
          calls += 1;
          // The first answer is immediate; the refresh waits until the test lets it go.
          if (calls > 1) await held;
          return json(predictions);
        },
      ],
    ]);
    const t = testApp();
    await t.request("/api/tides?station=8651370");
    await t.settle();
    t.clock.now += 20 * MINUTE;

    // Five requests while the entry is stale: each is answered at once from the cache, and only one refresh runs.
    const answers = await Promise.all(Array.from({ length: 5 }, () => t.request("/api/tides?station=8651370")));
    expect(answers.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(upstream.calls).toHaveLength(2);

    release();
    await t.settle();
    expect(upstream.calls).toHaveLength(2);

    // Once it is done, the next stale period may refresh again.
    t.clock.now += 20 * MINUTE;
    await t.request("/api/tides?station=8651370");
    await t.settle();
    expect(upstream.calls).toHaveLength(3);
  });

  it("asks NOAA again, and waits for it, once the entry is more than 75 minutes old", async () => {
    const upstream = noaaAnswers();
    const t = testApp();
    await t.request("/api/tides?station=8651370");
    t.clock.now += 76 * MINUTE;
    const response = await t.request("/api/tides?station=8651370");
    expect(response.status).toBe(200);
    expect(upstream.calls).toHaveLength(2);
  });

  it("keeps serving the stale answer when NOAA fails", async () => {
    let up = true;
    stubUpstream([[NOAA, () => (up ? json(predictions) : new Response("busy", { status: 503 }))]]);
    const t = testApp();
    const fresh = await (await t.request("/api/tides?station=8651370")).text();
    up = false;
    t.clock.now += 30 * MINUTE;

    const response = await t.request("/api/tides?station=8651370");
    await t.settle();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(fresh);
  });

  it("says NOAA is unavailable, without NOAA's own words, when there is nothing to serve", async () => {
    stubUpstream([[NOAA, () => new Response("<html>gateway error</html>", { status: 502 })]]);
    const t = testApp();
    const response = await t.request("/api/tides?station=8651370");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "upstream_unavailable",
      message: "NOAA's tide predictions could not be reached. Try again in a little while.",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  });

  it("never follows a redirect from NOAA, in a way the Workers runtime accepts", async () => {
    const upstream = stubUpstream([[NOAA, () => new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/" } })]]);
    const t = testApp();
    const response = await t.request("/api/tides?station=8651370");

    expect(response.status).toBe(502);
    expect(upstream.calls).toHaveLength(1);
    expect(upstream.calls[0]!.redirect).toBe("manual");
  });

  it("says when NOAA has no predictions for a station", async () => {
    stubUpstream([[NOAA, () => json({ error: { message: "No Predictions data was found." } })]]);
    const t = testApp();
    const response = await t.request("/api/tides?station=8651370");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "no_predictions",
      message: "NOAA has no tide predictions for this station right now.",
    });
  });

  it("limits one client to 60 tide requests a minute, and leaves others alone", async () => {
    noaaAnswers();
    const t = testApp();
    for (let index = 0; index < 60; index += 1) {
      expect((await t.request("/api/tides?station=8651370")).status).toBe(200);
    }
    const limited = await t.request("/api/tides?station=8651370");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "rate_limited",
      message: "Too many requests. Try again in a minute.",
    });
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);

    const other = await t.request("/api/tides?station=8651370", undefined, "203.0.113.9");
    expect(other.status).toBe(200);
    expect(CLIENT).not.toBe("203.0.113.9");
  });

  it("never lets one client flooding past its limit use up the shared cap and starve the others", async () => {
    noaaAnswers();
    const t = testApp();
    // 400 requests in a minute from one client: more than the instance's whole cap of 300.
    const statuses: number[] = [];
    for (let index = 0; index < 400; index += 1) {
      statuses.push((await t.request("/api/tides?station=8651370")).status);
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(60);
    // Its refused requests counted nowhere, so other clients are still answered.
    for (const client of ["203.0.113.9", "203.0.113.10", "203.0.113.11"]) {
      expect((await t.request("/api/tides?station=8651370", undefined, client)).status).toBe(200);
    }
  });

  it("counts an IPv6 client by its /64, since it can pick any address in it", async () => {
    noaaAnswers();
    const t = testApp();
    for (let index = 0; index < 60; index += 1) {
      await t.request("/api/tides?station=8651370", undefined, `2001:db8:1:2::${(index + 1).toString(16)}`);
    }
    const limited = await t.request("/api/tides?station=8651370", undefined, "2001:db8:1:2:ffff::1");
    expect(limited.status).toBe(429);
  });
});
