import { Hono } from "hono";
import {
  checkApiRateLimit,
  sharedCapacity,
  rateLimitHeaders,
  resolveStation,
  type FixedWindowRateLimiter,
  type ResolvedStation,
} from "../../lib/api-guard";
import { fetchExtrema, NoPredictionsError, stationNow } from "../../lib/tides";
import { stationTimeZone } from "../../lib/time-zones";
import type { AppDeps, AppEnv } from "../env";
import { CapacityReached, cacheKey, readThrough } from "../lib/cache";
import { fail, INVALID_STATION, logFailure } from "../lib/http";

const MINUTE = 60_000;
/** The whole NOAA call, retries of the connection included. */
const NOAA_DEADLINE_MS = 8_000;

/** What the page needs to name the station: the curated beach, or just the NOAA ids. */
function describe(station: ResolvedStation) {
  const curated = station.curated;
  return curated
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
    : { id: station.id, noaaId: station.noaaId };
}

/**
 * GET /api/tides?station=<id> - NOAA's hi/lo predictions from yesterday to a
 * month ahead (the page draws any day of it without asking again). Cached per
 * station for 15 minutes, then served stale for up to an hour while one refresh
 * runs, the way Vercel's edge cache served it.
 */
export function tidesRoute(deps: AppDeps, limiter: FixedWindowRateLimiter) {
  return new Hono<AppEnv>().get("/", async (c) => {
    const now = deps.now();
    // An unknown station is refused before anything counts it.
    const station = resolveStation(c.req.query("station"));
    if (!station) {
      return fail(c, 400, "invalid_station", INVALID_STATION);
    }
    const budget = checkApiRateLimit(limiter, c.req.raw, "tides", now);
    if (!budget.allowed) {
      return fail(c, 429, "rate_limited", "Too many requests. Try again in a minute.", rateLimitHeaders(budget));
    }

    try {
      const body = await readThrough({
        cache: await deps.cache(),
        key: cacheKey(c.env.APP_ORIGIN, "tides", station.id),
        now,
        produce: async () => ({
          station: describe(station),
          extrema: await fetchExtrema(
            station.noaaId,
            new Date(stationNow(new Date(now), stationTimeZone(station))),
            1,
            31,
            AbortSignal.timeout(NOAA_DEADLINE_MS),
            stationTimeZone(station),
          ),
        }),
        lifetime: () => ({ freshMs: 15 * MINUTE, staleMs: 60 * MINUTE }),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        refreshing: deps.refreshing,
        admit: sharedCapacity(limiter, "tides", now),
      });
      return c.json(body, 200, { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" });
    } catch (error) {
      // The instance's shared cap is used up and this station is not cached: NOAA is not asked.
      if (error instanceof CapacityReached) return fail(c, 429, "rate_limited", "Too many requests. Try again in a minute.", {
          "Retry-After": String(error.retryAfterSeconds),
        });
      if (error instanceof NoPredictionsError) {
        return fail(c, 502, "no_predictions", "NOAA has no tide predictions for this station right now.");
      }
      logFailure("tides_upstream_failed", error);
      return fail(
        c,
        502,
        "upstream_unavailable",
        "NOAA's tide predictions could not be reached. Try again in a little while.",
      );
    }
  });
}
