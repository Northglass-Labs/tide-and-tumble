import { NextRequest, NextResponse } from "next/server";
import { nearestStations } from "@/lib/nearest";

export const revalidate = 86400; // station coordinates never change

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
  }
  const nearby = nearestStations(lat, lng, 6);
  if (!nearby.length) {
    return NextResponse.json({ error: "No station found" }, { status: 404 });
  }
  return NextResponse.json(
    { nearest: nearby[0], nearby },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
