import { NextRequest, NextResponse } from "next/server";
import { fetchExtrema, stationNow } from "@/lib/tides";
import { findStation } from "@/lib/stations";

// Tide predictions are deterministic; cache generously.
export const revalidate = 900;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("station");
  if (!id) {
    return NextResponse.json({ error: "Missing station" }, { status: 400 });
  }
  // Accept any NOAA station id (nationwide), not just curated beaches. Curated
  // ids may carry a "-suffix" for town disambiguation; strip it to the NOAA id.
  const noaa = id.split("-")[0];
  if (!/^\d{6,8}$/.test(noaa)) {
    return NextResponse.json({ error: "Invalid station id" }, { status: 400 });
  }
  const curated = findStation(id);

  try {
    const anchor = new Date(stationNow());
    // Fetch a ~32-day window (yesterday → +31d) so the client can render any day
    // in the day switcher without another request.
    const extrema = await fetchExtrema(noaa, anchor, 1, 31);
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
          : { id, noaaId: noaa },
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
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
