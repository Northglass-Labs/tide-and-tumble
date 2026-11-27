import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetchBeachSafety: vi.fn(async () => ({
    alerts: [],
    ripRisk: null,
    uvIndex: null,
    source: null,
  })),
  fetchExtrema: vi.fn(async () => []),
  fetchMarine: vi.fn(async () => ({
    waterTempF: null,
    windMph: null,
    windDir: null,
    windGustMph: null,
    surfFt: null,
    surfPeriodS: null,
    source: null,
  })),
  nearestStations: vi.fn(() => [
    {
      id: "8651370",
      name: "Duck",
      lat: 36.1833,
      lng: -75.7467,
      state: "NC",
      type: "R",
      distanceMi: 1,
    },
  ]),
}));

vi.mock("@/lib/alerts", () => ({ fetchBeachSafety: mocks.fetchBeachSafety }));
vi.mock("@/lib/marine", () => ({ fetchMarine: mocks.fetchMarine }));
vi.mock("@/lib/nearest", () => ({ nearestStations: mocks.nearestStations }));
vi.mock("@/lib/tides", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tides")>();
  return { ...actual, fetchExtrema: mocks.fetchExtrema };
});

import { GET as getAlerts } from "@/app/api/alerts/route";
import { GET as getMarine } from "@/app/api/marine/route";
import { GET as getTides } from "@/app/api/tides/route";

beforeEach(() => vi.clearAllMocks());

describe("public API route boundaries", () => {
  test("rejects out-of-range coordinates before NWS work", async () => {
    const response = await getAlerts(
      new NextRequest("https://tide.test/api/alerts?lat=91&lng=-75"),
    );

    expect(response.status).toBe(400);
    expect(mocks.fetchBeachSafety).not.toHaveBeenCalled();
  });

  test("marks coordinate-derived API responses private and non-cacheable", async () => {
    const alerts = await getAlerts(
      new NextRequest("https://tide.test/api/alerts?lat=35.9&lng=-75.6", {
        headers: { "x-vercel-forwarded-for": "198.51.100.20" },
      }),
    );
    const marine = await getMarine(
      new NextRequest(
        "https://tide.test/api/marine?station=8651370&lat=35.9&lng=-75.6",
        { headers: { "x-vercel-forwarded-for": "198.51.100.21" } },
      ),
    );

    expect(alerts.headers.get("Cache-Control")).toMatch(/private.*no-store/i);
    expect(marine.headers.get("Cache-Control")).toMatch(/private.*no-store/i);
  });

  test("rejects station identifiers outside the bundled NOAA set", async () => {
    const tide = await getTides(
      new NextRequest("https://tide.test/api/tides?station=99999999", {
        headers: { "x-vercel-forwarded-for": "198.51.100.22" },
      }),
    );
    const marine = await getMarine(
      new NextRequest(
        "https://tide.test/api/marine?station=99999999&lat=35.9&lng=-75.6",
        { headers: { "x-vercel-forwarded-for": "198.51.100.23" } },
      ),
    );

    expect(tide.status).toBe(400);
    expect(marine.status).toBe(400);
    expect(mocks.fetchExtrema).not.toHaveBeenCalled();
    expect(mocks.fetchMarine).not.toHaveBeenCalled();
  });

  test("accepts location via bounded POST and returns a no-store response", async () => {
    const nearestRoute = await import("@/app/api/nearest/route");
    expect(nearestRoute.POST).toBeTypeOf("function");

    const response = await nearestRoute.POST(
      new NextRequest("https://tide.test/api/nearest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.24",
        },
        body: JSON.stringify({ lat: 35.9, lng: -75.6 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toMatch(/private.*no-store/i);
    expect(mocks.nearestStations).toHaveBeenCalledWith(35.9, -75.6, 6);
  });

  test("returns 429 after the per-client alert budget is exhausted", async () => {
    const request = () =>
      new NextRequest("https://tide.test/api/alerts?lat=35.9&lng=-75.6", {
        headers: { "x-vercel-forwarded-for": "198.51.100.250" },
      });

    let response: Response | undefined;
    for (let index = 0; index < 31; index += 1) {
      response = await getAlerts(request());
    }

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
  });
});
