/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import TideApp from "@/components/TideApp";
import { findStation } from "@/lib/stations";
import predictions from "../fixtures/upstream/noaa-hilo-8651370.json";

/** The API's tide answer for the fixture's station, as the Worker builds it. */
const tides = {
  station: { id: "8651370", label: "Corolla" },
  extrema: predictions.predictions.map((p) => {
    const [date, time] = p.t.split(" ");
    const [y, mo, d] = date!.split("-").map(Number);
    const [h, mi] = time!.split(":").map(Number);
    return { time: Date.UTC(y!, mo! - 1, d!, h!, mi!), height: Number(p.v), type: p.type };
  }),
};
const noMarine = {
  waterTempF: null,
  windMph: null,
  windDir: null,
  windGustMph: null,
  surfFt: null,
  surfPeriodS: null,
  source: null,
};

/** Answers the page's API calls; `safety` is what /api/alerts says. */
function serveApi(safety: unknown) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("/api/tides")) return Response.json(tides);
      if (url.startsWith("/api/marine")) return Response.json(noMarine);
      if (url.startsWith("/api/alerts")) return Response.json(safety);
      return new Response("not found", { status: 404 });
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T15:00:00Z"));
  // jsdom has no matchMedia (reduced-motion checks) and no canvas.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // jsdom does not lay out, so it has no scrollIntoView (the day strip calls it).
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TideApp's beach safety notice", () => {
  const station = findStation("8651370")!;

  test("says the safety data is unavailable when NWS did not answer in full, never 'no warnings'", async () => {
    serveApi({ alerts: [], ripRisk: null, uvIndex: null, source: "NWS (MHX)", complete: false });
    render(<TideApp initialStation={station} seeded />);

    expect(await screen.findByText("Beach safety data is unavailable.")).toBeTruthy();
  });

  test("shows no such notice when NWS answered in full", async () => {
    const calls = serveApi({ alerts: [], ripRisk: null, uvIndex: null, source: "NWS (MHX)", complete: true });
    render(<TideApp initialStation={station} seeded />);

    await waitFor(() => expect(calls.some((url) => url.startsWith("/api/alerts"))).toBe(true));
    // Let the answer land, then check that nothing claims the data is missing.
    await waitFor(() => expect(screen.queryByText(/Beach safety data/)).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Beach safety data/)).toBeNull();
  });

  test("treats an answer that does not say it is complete as unavailable", async () => {
    serveApi({ alerts: [], ripRisk: null, uvIndex: null, source: null });
    render(<TideApp initialStation={station} seeded />);

    expect(await screen.findByText("Beach safety data is unavailable.")).toBeTruthy();
  });

  test("still shows the warnings it did get when the answer is incomplete", async () => {
    serveApi({
      alerts: [{ id: "rip-risk", event: "High Rip Current Risk", severity: "Severe", summary: "Stay out of the surf." }],
      ripRisk: "High",
      uvIndex: null,
      source: "NWS (MHX)",
      complete: false,
    });
    render(<TideApp initialStation={station} seeded />);

    expect(await screen.findByText("Beach safety data is unavailable.")).toBeTruthy();
    expect((await screen.findAllByText(/High Rip Current Risk/)).length).toBeGreaterThan(0);
  });
});
