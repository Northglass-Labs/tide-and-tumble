import { NextRequest, NextResponse } from "next/server";
import { fetchMarine } from "@/lib/marine";

export const revalidate = 600;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get("station") ?? undefined;
  const lat = parseFloat(q.get("lat") ?? "");
  const lng = parseFloat(q.get("lng") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
  }
  try {
    const marine = await fetchMarine({
      noaaId: id ? id.split("-")[0] : undefined,
      lat,
      lng,
    });
    return NextResponse.json(marine, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    });
  } catch {
    return NextResponse.json({
      waterTempF: null, windMph: null, windDir: null, windGustMph: null,
      surfFt: null, surfPeriodS: null, source: null,
    });
  }
}
