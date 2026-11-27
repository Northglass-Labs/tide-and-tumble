import { Hono } from "hono";
import { fetchBeachSafetyChecked } from "../../lib/alerts";
import {
  checkApiRateLimit,
  sharedCapacity,
  PRIVATE_NO_STORE_HEADERS,
  rateLimitHeaders,
  resolveStation,
  type FixedWindowRateLimiter,
} from "../../lib/api-guard";
import type { AppDeps, AppEnv } from "../env";
import { CapacityReached, cacheKey, readThrough } from "../lib/cache";
import { fail, INVALID_STATION } from "../lib/http";

const MINUTE = 60_000;
const DEADLINE_MS = 8_000;

/**
 * GET /api/alerts?station=<id> - the National Weather Service's beach alerts,
 * the day's rip-current risk and the UV index for the station's point, and
 * `complete`: whether NWS answered every call. Server side because NWS asks
 * for an identifying User-Agent, and because a browser call would give NWS
 * every visitor's address.
 *
 * An answer with a failed call may be missing a warning, so `complete: false`
 * tells the page to say the safety data is unavailable rather than show "no
 * warnings". A complete answer is kept 15 minutes, as Next's data cache kept
 * the NWS answers; an incomplete one one minute, so a point NWS does not cover
 * is not asked about on every request. Never served stale.
 */
export function alertsRoute(deps: AppDeps, limiter: FixedWindowRateLimiter) {
  return new Hono<AppEnv>().get("/", async (c) => {
    const now = deps.now();
    // An unknown station is refused before anything counts it.
    const station = resolveStation(c.req.query("station"));
    if (!station) {
      return fail(c, 400, "invalid_station", INVALID_STATION);
    }
    const budget = checkApiRateLimit(limiter, c.req.raw, "alerts", now);
    if (!budget.allowed) {
      return fail(c, 429, "rate_limited", "Too many requests. Try again in a minute.", rateLimitHeaders(budget));
    }

    let result;
    try {
      result = await readThrough({
        cache: await deps.cache(),
        key: cacheKey(c.env.APP_ORIGIN, "alerts", station.id),
        now,
        produce: () => fetchBeachSafetyChecked(station.lat, station.lng, AbortSignal.timeout(DEADLINE_MS), now),
        lifetime: (value) => ({ freshMs: value.complete ? 15 * MINUTE : MINUTE, staleMs: 0 }),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        refreshing: deps.refreshing,
        admit: sharedCapacity(limiter, "alerts", now),
      });
    } catch (error) {
      if (error instanceof CapacityReached) return fail(c, 429, "rate_limited", "Too many requests. Try again in a minute.", {
          "Retry-After": String(error.retryAfterSeconds),
        });
      throw error;
    }
    return c.json({ ...result.safety, complete: result.complete }, 200, PRIVATE_NO_STORE_HEADERS);
  });
}
