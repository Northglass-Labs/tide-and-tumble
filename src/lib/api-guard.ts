import rawStations from "./noaa-stations.json";
import { STATIONS as CURATED_STATIONS, findStation, type Station } from "./stations";

interface RawStation {
  i: string;
  a: number;
  o: number;
}

const NOAA_STATIONS = new Map(
  (rawStations as RawStation[]).map((station) => [station.i, station]),
);
const KNOWN_NOAA_STATIONS = new Set(NOAA_STATIONS.keys());
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

  /** The client's own limit only: every valid request counts. */
  checkClient(scope: string, clientKey: string, policy: RatePolicy, now = Date.now()): RateDecision {
    return this.consume(`client:${scope}:${clientKey}`, policy.clientLimit, policy.windowMs, now);
  }

  /**
   * A share of the instance's cap, taken only by a request that is about to
   * ask the upstream: answers from the cache cost the upstream nothing.
   */
  takeShared(scope: string, policy: RatePolicy, now = Date.now()): RateDecision {
    return this.consume(`global:${scope}`, policy.globalLimit, policy.windowMs, now);
  }

  /**
   * The client's own limit first: a refused request returns at once and
   * counts nowhere else, so a client flooding past its limit cannot use up
   * the shared cap and starve everyone else. Only requests the client's
   * limit accepts count against the shared cap.
   */
  check(
    scope: string,
    clientKey: string,
    policy: RatePolicy,
    now = Date.now(),
  ): RateDecision {
    const client = this.consume(
      `client:${scope}:${clientKey}`,
      policy.clientLimit,
      policy.windowMs,
      now,
    );
    if (!client.allowed) return client;
    const global = this.consume(
      `global:${scope}`,
      policy.globalLimit,
      policy.windowMs,
      now,
    );
    return {
      allowed: global.allowed,
      limit: client.limit,
      remaining: Math.min(global.remaining, client.remaining),
      retryAfterSeconds: global.retryAfterSeconds,
    };
  }
}

/**
 * A station a request named, with the coordinates its beach data comes from:
 * a curated beach's own, otherwise the NOAA station's. These are the
 * coordinates the page sent itself before the API took station ids only.
 */
export interface ResolvedStation {
  id: string;
  noaaId: string;
  lat: number;
  lng: number;
  curated: Station | undefined;
}

export function resolveStation(
  raw: string | null | undefined,
): ResolvedStation | null {
  const station = parseStationId(raw);
  if (!station) return null;
  const curated = findStation(station.id);
  const source = curated ?? NOAA_STATIONS.get(station.noaaId);
  if (!source) return null;
  const coordinates = curated
    ? parseCoordinates(curated.lat, curated.lng)
    : parseCoordinates((source as RawStation).a, (source as RawStation).o);
  if (!coordinates) return null;
  return { ...station, ...coordinates, curated };
}

export type ApiScope = "alerts" | "marine" | "tides";

/** Per client and per Worker instance, each minute (the limits the Vercel routes had). */
export const POLICIES: Record<ApiScope, RatePolicy> = {
  alerts: { clientLimit: 30, globalLimit: 240, windowMs: 60_000 },
  marine: { clientLimit: 30, globalLimit: 180, windowMs: 60_000 },
  tides: { clientLimit: 60, globalLimit: 300, windowMs: 60_000 },
};

/**
 * Who is asking, for the per-client limits: the address Cloudflare saw
 * (`CF-Connecting-IP`, which a client cannot set through Cloudflare). An IPv6
 * client holds a whole /64 and can pick any address in it, so it counts as its
 * /64. Anything unreadable shares one key.
 */
export function clientKey(request: Request): string {
  const text =
    request.headers.get("CF-Connecting-IP")?.trim().toLowerCase().split("%")[0] ?? "";
  if (!/^[0-9a-f:.]{2,64}$/.test(text)) return "unknown";
  if (!text.includes(":")) return text;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (mapped?.[1]) return mapped[1];

  const halves = text.split("::");
  if (halves.length > 2) return "unknown";
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  // "::" stands for one or more groups of zeros; without it there are exactly eight groups.
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return "unknown";
  const groups = [
    ...left,
    ...Array<string>(halves.length === 2 ? missing : 0).fill("0"),
    ...right,
  ];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return "unknown";
  return `${groups.slice(0, 4).map((group) => group.padStart(4, "0")).join(":")}::/64`;
}

/**
 * The client's own limit for one request. The instance's shared cap is
 * taken separately, only when the request would ask the upstream
 * (`sharedCapacity`).
 */
export function checkApiRateLimit(
  limiter: FixedWindowRateLimiter,
  request: Request,
  scope: ApiScope,
  now?: number,
): RateDecision {
  return limiter.checkClient(scope, clientKey(request), POLICIES[scope], now);
}

/** Takes a share of the instance's cap for `scope`: false when it is used up. */
export function sharedCapacity(limiter: FixedWindowRateLimiter, scope: ApiScope, now?: number): () => boolean {
  return () => limiter.takeShared(scope, POLICIES[scope], now).allowed;
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
