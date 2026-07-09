import { NextRequest, NextResponse } from "next/server";
import { fetchBeachSafety } from "@/lib/alerts";

export const revalidate = 900;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const lat = parseFloat(q.get("lat") ?? "");
  const lng = parseFloat(q.get("lng") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
  }
  const safety = await fetchBeachSafety(lat, lng);
  return NextResponse.json(safety, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
