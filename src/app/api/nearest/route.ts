import { NextRequest, NextResponse } from "next/server";
import {
  checkApiRateLimit,
  parseCoordinates,
  PRIVATE_NO_STORE_HEADERS,
  rateLimitHeaders,
} from "@/lib/api-guard";
import { nearestStations } from "@/lib/nearest";
import {
  readJsonBounded,
  UpstreamResponseTooLargeError,
} from "@/lib/upstream";

export const revalidate = 0;
export const maxDuration = 5;
const LOCATION_BODY_MAX_BYTES = 1_024;

function limited(req: NextRequest): NextResponse | null {
  const budget = checkApiRateLimit(req, "nearest");
  return budget.allowed
    ? null
    : NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(budget) },
      );
}

function nearestResponse(
  rawLat: string | number | null | undefined,
  rawLng: string | number | null | undefined,
) {
  const coordinates = parseCoordinates(rawLat, rawLng);
  if (!coordinates) {
    return NextResponse.json(
      { error: "Invalid lat/lng" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  const nearby = nearestStations(coordinates.lat, coordinates.lng, 6);
  if (!nearby.length) {
    return NextResponse.json(
      { error: "No station found" },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(
    { nearest: nearby[0], nearby },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}

/** Backward-compatible GET. The application itself uses POST to keep coordinates out of URLs. */
export async function GET(req: NextRequest) {
  const rateLimited = limited(req);
  if (rateLimited) return rateLimited;
  return nearestResponse(
    req.nextUrl.searchParams.get("lat"),
    req.nextUrl.searchParams.get("lng"),
  );
}

export async function POST(req: NextRequest) {
  const rateLimited = limited(req);
  if (rateLimited) return rateLimited;
  try {
    const body = await readJsonBounded<{ lat?: unknown; lng?: unknown }>(
      req,
      LOCATION_BODY_MAX_BYTES,
    );
    return nearestResponse(
      typeof body.lat === "number" || typeof body.lat === "string"
        ? body.lat
        : null,
      typeof body.lng === "number" || typeof body.lng === "string"
        ? body.lng
        : null,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof UpstreamResponseTooLargeError
            ? "Request body too large"
            : "Invalid JSON body",
      },
      {
        status: error instanceof UpstreamResponseTooLargeError ? 413 : 400,
        headers: PRIVATE_NO_STORE_HEADERS,
      },
    );
  }
}
