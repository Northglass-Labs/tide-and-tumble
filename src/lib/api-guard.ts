import rawStations from "./noaa-stations.json";
import { STATIONS as CURATED_STATIONS } from "./stations";

interface RawStation {
  i: string;
}

const KNOWN_NOAA_STATIONS = new Set(
  (rawStations as RawStation[]).map((station) => station.i),
);
const KNOWN_REQUEST_STATIONS = new Set([
  ...KNOWN_NOAA_STATIONS,
  ...CURATED_STATIONS.map((station) => station.id.toLowerCase()),
]);
const STATION_PATTERN = /^(\d{6,8})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/i;

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

export function parseCoordinates(
  rawLat: string | number | null | undefined,
  rawLng: string | number | null | undefined,
): { lat: number; lng: number } | null {
  if (
    rawLat == null ||
    rawLng == null ||
    String(rawLat).trim() === "" ||
    String(rawLng).trim() === ""
  ) {
    return null;
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return {
    lat: Math.round(lat * 10_000) / 10_000,
    lng: Math.round(lng * 10_000) / 10_000,
  };
}

export function parseStationId(
  raw: string | null | undefined,
): { id: string; noaaId: string } | null {
  const id = raw?.trim() ?? "";
  const match = id.match(STATION_PATTERN);
  const normalized = id.toLowerCase();
  if (!match || !KNOWN_REQUEST_STATIONS.has(normalized)) return null;
  return { id: normalized, noaaId: match[1] };
}

export interface RatePolicy {
  clientLimit: number;
  globalLimit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxBuckets: number;

  constructor({ maxBuckets = 2_048 }: { maxBuckets?: number } = {}) {
    this.maxBuckets = maxBuckets;
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.maxBuckets) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (!oldest) break;
      this.buckets.delete(oldest);
    }
  }

  private consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): RateDecision {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.prune(now);
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    } else {
      // Refresh insertion order so bounded-map eviction removes the stalest key.
      this.buckets.delete(key);
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;
    const allowed = bucket.count <= limit;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }

  check(
    scope: string,
    clientKey: string,
    policy: RatePolicy,
    now = Date.now(),
  ): RateDecision {
    const global = this.consume(
      `global:${scope}`,
      policy.globalLimit,
      policy.windowMs,
      now,
    );
    const client = this.consume(
      `client:${scope}:${clientKey}`,
      policy.clientLimit,
      policy.windowMs,
      now,
    );
    return {
      allowed: global.allowed && client.allowed,
      limit: client.limit,
      remaining: Math.min(global.remaining, client.remaining),
      retryAfterSeconds: Math.max(
        global.retryAfterSeconds,
        client.retryAfterSeconds,
      ),
    };
  }
}

export type ApiScope = "alerts" | "marine" | "nearest" | "tides";

const POLICIES: Record<ApiScope, RatePolicy> = {
  alerts: { clientLimit: 30, globalLimit: 240, windowMs: 60_000 },
  marine: { clientLimit: 30, globalLimit: 180, windowMs: 60_000 },
  nearest: { clientLimit: 30, globalLimit: 300, windowMs: 60_000 },
  tides: { clientLimit: 60, globalLimit: 300, windowMs: 60_000 },
};
const limiter = new FixedWindowRateLimiter();

function clientKey(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const first = forwarded.split(",")[0]?.trim() ?? "unknown";
  return /^[0-9a-f:.]{3,64}$/i.test(first) ? first : "unknown";
}

export function checkApiRateLimit(
  request: Request,
  scope: ApiScope,
): RateDecision {
  return limiter.check(scope, clientKey(request), POLICIES[scope]);
}

export function rateLimitHeaders(
  decision: RateDecision,
): Record<string, string> {
  return {
    ...PRIVATE_NO_STORE_HEADERS,
    "Retry-After": String(decision.retryAfterSeconds),
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
  };
}
