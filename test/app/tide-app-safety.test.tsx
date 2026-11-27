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

  test("gives up on NWS after ten seconds and says the safety data is unavailable", async () => {
    // The alerts request is given a ten-second deadline; here it has already passed.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort());
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/tides")) return Promise.resolve(Response.json(tides));
        if (url.startsWith("/api/marine")) return Promise.resolve(Response.json(noMarine));
        // NWS never answers: only the deadline ends this request.
        return new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) reject(signal.reason);
          signal?.addEventListener("abort", () => reject(signal.reason));
        });
      }),
    );
    render(<TideApp initialStation={station} seeded />);

    expect(await screen.findByText("Beach safety data is unavailable.")).toBeTruthy();
    expect(timeout).toHaveBeenCalledWith(10_000);
  });

  test("shows that it is checking the warnings until NWS answers", async () => {
    let answer: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/tides")) return Promise.resolve(Response.json(tides));
        if (url.startsWith("/api/marine")) return Promise.resolve(Response.json(noMarine));
        return new Promise<Response>((resolve) => {
          answer = resolve;
        });
      }),
    );
    render(<TideApp initialStation={station} seeded />);

    expect(await screen.findByText("Checking NWS beach warnings…")).toBeTruthy();
    answer(Response.json({ alerts: [], ripRisk: null, uvIndex: null, source: "NWS (MHX)", complete: true }));
    await waitFor(() => expect(screen.queryByText("Checking NWS beach warnings…")).toBeNull());
  });

  test("says when NWS has no rip-current forecast for today, rather than showing nothing", async () => {
    const cases: [string, string, string | null][] = [
      ["not-yet", "No NWS rip-current forecast for today yet.", null],
      ["out-of-season", "No NWS rip-current forecasts are being issued here this season.", null],
      ["none", "Today's NWS forecast gives no rip-current risk for this beach.", null],
      ["today", "Low rip current risk today (NWS)", "Low"],
    ];
    for (const [ripForecast, note, ripRisk] of cases) {
      serveApi({ alerts: [], ripRisk, uvIndex: null, source: "NWS (MHX)", complete: true, ripForecast });
      render(<TideApp initialStation={station} seeded />);
      expect(await screen.findByText(note)).toBeTruthy();
      cleanup();
    }
  });
});

