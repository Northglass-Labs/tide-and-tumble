import { NextRequest, NextResponse } from "next/server";
import { fetchBeachSafety } from "@/lib/alerts";
import {
  checkApiRateLimit,
  parseCoordinates,
  PRIVATE_NO_STORE_HEADERS,
  rateLimitHeaders,
} from "@/lib/api-guard";

export const revalidate = 900;
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const budget = checkApiRateLimit(req, "alerts");
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
  const safety = await fetchBeachSafety(
    coordinates.lat,
    coordinates.lng,
    AbortSignal.timeout(8_000),
  );
  return NextResponse.json(safety, {
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}
