import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchBeachSafety } from "@/lib/alerts";

function json(data: unknown): Response {
  return Response.json(data);
}

function installNwsMock(input: {
  point?: unknown;
  alerts?: unknown;
  list?: unknown;
  product?: unknown;
}) {
  const mock = vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.includes("/points/")) return json(input.point ?? { properties: {} });
    if (url.includes("/alerts/active")) return json(input.alerts ?? { features: [] });
    if (url.includes("/products/types/SRF/")) {
      return json(input.list ?? { "@graph": [] });
    }
    if (url === "https://api.weather.gov/products/test") {
      return json(input.product ?? {});
    }
    throw new Error("unexpected outbound request: " + url);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe("NWS safety boundary", () => {
  test.each([
    {
      name: "requested zone is absent",
      point: {
        properties: {
          gridId: "AKQ",
          forecastZone: "https://api.weather.gov/zones/forecast/NCZ203",
        },
      },
    },
    {
      name: "point response omits its forecast zone",
      point: { properties: { gridId: "AKQ" } },
    },
  ])("does not substitute another SRF zone when $name", async ({ point }) => {
    installNwsMock({
      point,
      list: { "@graph": [{ "@id": "https://api.weather.gov/products/test" }] },
      product: {
        productText:
          "NCZ204-\n.RIP CURRENT RISK...High.\n.UV INDEX...Very High.\n$$",
      },
    });

    const safety = await fetchBeachSafety(35.9, -75.6);

    expect(safety.ripRisk).toBeNull();
    expect(safety.uvIndex).toBeNull();
    expect(safety.alerts).toEqual([]);
  });

  test("skips wrong-typed fields while preserving valid formal alerts", async () => {
    installNwsMock({
      alerts: {
        features: [
          { id: "bad-event", properties: { event: { value: "High Surf" } } },
          {
            id: 42,
            properties: {
              event: "High Surf Advisory",
              severity: 7,
              description: { text: "wrong shape" },
            },
          },
        ],
      },
    });

    const safety = await fetchBeachSafety(35.9, -75.6);

    expect(safety.alerts).toEqual([
      {
        id: "High Surf Advisory",
        event: "High Surf Advisory",
        severity: "Unknown",
        summary: "",
      },
    ]);
  });

  test("contains a wrong-typed product body instead of aborting all safety data", async () => {
    installNwsMock({
      point: {
        properties: {
          gridId: "AKQ",
          forecastZone: "https://api.weather.gov/zones/forecast/NCZ203",
        },
      },
      alerts: {
        features: [
          {
            id: "formal",
            properties: {
              event: "Beach Hazards Statement",
              severity: "Moderate",
              description: "Swim near a lifeguard.",
            },
          },
        ],
      },
      list: { "@graph": [{ "@id": "https://api.weather.gov/products/test" }] },
      product: { productText: { unexpected: true } },
    });

    await expect(fetchBeachSafety(35.9, -75.6)).resolves.toMatchObject({
      alerts: [{ id: "formal", event: "Beach Hazards Statement" }],
      ripRisk: null,
      uvIndex: null,
    });
  });

  test("does not follow a provider product URL outside api.weather.gov", async () => {
    const fetchMock = installNwsMock({
      point: {
        properties: {
          gridId: "AKQ",
          forecastZone: "https://api.weather.gov/zones/forecast/NCZ203",
        },
      },
      list: { "@graph": [{ "@id": "http://127.0.0.1/internal" }] },
    });

    await expect(fetchBeachSafety(35.9, -75.6)).resolves.toMatchObject({
      ripRisk: null,
      uvIndex: null,
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://127.0.0.1/internal",
      expect.anything(),
    );
  });
});
