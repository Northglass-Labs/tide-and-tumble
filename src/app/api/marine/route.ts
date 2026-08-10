import { NextRequest, NextResponse } from "next/server";
import { fetchMarine } from "@/lib/marine";
import {
  checkApiRateLimit,
  parseCoordinates,
  parseStationId,
  PRIVATE_NO_STORE_HEADERS,
  rateLimitHeaders,
} from "@/lib/api-guard";

export const revalidate = 600;
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const budget = checkApiRateLimit(req, "marine");
  if (!budget.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(budget) },
    );
  }
  const q = req.nextUrl.searchParams;
  const coordinates = parseCoordinates(q.get("lat"), q.get("lng"));
  if (!coordinates) {
    return NextResponse.json(
      { error: "Invalid lat/lng" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  const rawStation = q.get("station");
  const station = rawStation ? parseStationId(rawStation) : null;
  if (rawStation && !station) {
    return NextResponse.json(
      { error: "Invalid station id" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  try {
    const marine = await fetchMarine({
      noaaId: station?.noaaId,
      lat: coordinates.lat,
      lng: coordinates.lng,
      signal: AbortSignal.timeout(8_000),
    });
    return NextResponse.json(marine, {
      headers: PRIVATE_NO_STORE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      {
        waterTempF: null,
        windMph: null,
        windDir: null,
        windGustMph: null,
        surfFt: null,
        surfPeriodS: null,
        source: null,
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
