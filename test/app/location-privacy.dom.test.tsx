/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import TideApp from "@/components/TideApp";
import { findStation } from "@/lib/stations";

/** A precise position, as the browser's geolocation gives it: far from the page's first beach. */
const HERE = { latitude: 26.70528, longitude: -80.03642 };

/** Everything the page sends while it runs: each request's address and body. */
function recordRequests() {
  const sent: { url: string; body: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), body: typeof init?.body === "string" ? init.body : String(init?.body ?? "") });
      if (String(input).startsWith("/api/tides")) return Response.json({ station: {}, extrema: [] });
      return Response.json({});
    }),
  );
  return sent;
}

beforeEach(() => {
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
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: { ...HERE, accuracy: 5 } } as unknown as GeolocationPosition),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("precise-location privacy, in the running page", () => {
  test("'Near me' finds the beach on the device; nothing sent names the position", async () => {
    const sent = recordRequests();
    render(<TideApp initialStation={findStation("8651370")!} seeded />);
    await waitFor(() => expect(sent.some((request) => request.url.startsWith("/api/alerts"))).toBe(true));
    const before = sent.length;

    fireEvent.click(screen.getByText("change ›"));
    fireEvent.click(await screen.findByRole("button", { name: /Near me/ }));

    // The nearest beach to the position (Lake Worth Pier, 8722621) was chosen on the device, and the page asks
    // for its data by station id only; everything else it loads is its own static files.
    await waitFor(() => expect(sent.slice(before).map((request) => request.url)).toContain("/api/tides?station=8722621"));
    const after = sent.slice(before).map((request) => request.url);
    expect(after.filter((url) => url.startsWith("/api/")).sort()).toEqual([
      "/api/alerts?station=8722621",
      "/api/marine?station=8722621",
      "/api/tides?station=8722621",
    ]);
    expect(after.filter((url) => !url.startsWith("/api/")).every((url) => /^\/[\w./-]+$/.test(url))).toBe(true);
    for (const request of sent) {
      for (const coordinate of [HERE.latitude, HERE.longitude]) {
        const leading = String(coordinate).slice(0, 5);
        expect(request.url).not.toContain(leading);
        expect(request.body).not.toContain(leading);
      }
      expect(request.url).not.toMatch(/[?&](?:lat|lng|lon)=/);
    }
  });
});
