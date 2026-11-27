import { Hono } from "hono";
import {
  checkApiRateLimit,
  sharedCapacity,
  PRIVATE_NO_STORE_HEADERS,
  rateLimitHeaders,
  resolveStation,
  type FixedWindowRateLimiter,
} from "../../lib/api-guard";
import { fetchMarine, type Marine } from "../../lib/marine";
import type { AppDeps, AppEnv } from "../env";
import { CapacityReached, cacheKey, readThrough } from "../lib/cache";
import { fail, INVALID_STATION, logFailure } from "../lib/http";

const MINUTE = 60_000;
const DEADLINE_MS = 8_000;

const EMPTY: Marine = {
  waterTempF: null,
  windMph: null,
  windDir: null,
  windGustMph: null,
  surfFt: null,
  surfPeriodS: null,
  source: null,
};

const isEmpty = (marine: Marine) => Object.values(marine).every((value) => value === null);

/**
 * GET /api/marine?station=<id> - water temperature, wind and surf from the
 * nearest NDBC buoys, and the tide gauge's own sensors. NDBC does not allow
 * browser calls, so this must be a server. Keyed by station: the coordinates
 * are the station's, never the request's. Cached for 10 minutes, as Next's
 * data cache kept the buoy files; an answer with no readings at all is kept for
 * one minute only, so a failed upstream is asked again soon.
 */
export function marineRoute(deps: AppDeps, limiter: FixedWindowRateLimiter) {
  return new Hono<AppEnv>().get("/", async (c) => {
    const now = deps.now();
    // An unknown station is refused before anything counts it.
    const station = resolveStation(c.req.query("station"));
    if (!station) {
      return fail(c, 400, "invalid_station", INVALID_STATION);
    }
    const budget = checkApiRateLimit(limiter, c.req.raw, "marine", now);
    if (!budget.allowed) {
      return fail(c, 429, "rate_limited", "Too many requests. Try again in a minute.", rateLimitHeaders(budget));
    }

    let marine = EMPTY;
    try {
      marine = await readThrough({
        cache: await deps.cache(),
        key: cacheKey(c.env.APP_ORIGIN, "marine", station.id),
        now,
        produce: () =>
          fetchMarine({
            noaaId: station.noaaId,
            lat: station.lat,
            lng: station.lng,
            signal: AbortSignal.timeout(DEADLINE_MS),
          }),
        lifetime: (value) => ({ freshMs: isEmpty(value) ? MINUTE : 10 * MINUTE, staleMs: 0 }),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        refreshing: deps.refreshing,
        admit: sharedCapacity(limiter, "marine", now),
      });
    } catch (error) {
      if (error instanceof CapacityReached) return fail(c, 429, "rate_limited", "Too many requests. Try again in a minute.", {
          "Retry-After": String(error.retryAfterSeconds),
        });
      // Every reading is optional: the page shows what it has.
      logFailure("marine_failed", error);
    }
    return c.json(marine, 200, PRIVATE_NO_STORE_HEADERS);
  });
}
