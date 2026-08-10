import { NextRequest, NextResponse } from "next/server";
import { fetchExtrema, stationNow } from "@/lib/tides";
import { findStation } from "@/lib/stations";
import {
  checkApiRateLimit,
  parseStationId,
  PRIVATE_NO_STORE_HEADERS,
  rateLimitHeaders,
} from "@/lib/api-guard";

// Tide predictions are deterministic; cache generously.
export const revalidate = 900;
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const budget = checkApiRateLimit(req, "tides");
  if (!budget.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(budget) },
    );
  }
  const station = parseStationId(req.nextUrl.searchParams.get("station"));
  if (!station) {
    return NextResponse.json(
      { error: "Invalid station id" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  const curated = findStation(station.id);

  try {
    const anchor = new Date(stationNow());
    // Fetch a ~32-day window (yesterday → +31d) so the client can render any day
    // in the day switcher without another request.
    const extrema = await fetchExtrema(
      station.noaaId,
      anchor,
      1,
      31,
      AbortSignal.timeout(8_000),
    );
    return NextResponse.json(
      {
        station: curated
          ? {
              id: curated.id,
              label: curated.label,
              stationName: curated.stationName,
              lat: curated.lat,
              lng: curated.lng,
              type: curated.type,
              exposure: curated.exposure,
              note: curated.note,
            }
          : { id: station.id, noaaId: station.noaaId },
        extrema,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tides";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
