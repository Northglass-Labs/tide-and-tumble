import { Hono } from "hono";
import { fetchBeachSafetyChecked } from "../../lib/alerts";
import {
  checkApiRateLimit,
  PRIVATE_NO_STORE_HEADERS,
  rateLimitHeaders,
  resolveStation,
  type FixedWindowRateLimiter,
} from "../../lib/api-guard";
import type { AppDeps, AppEnv } from "../env";
import { cacheKey, readThrough } from "../lib/cache";
import { fail, INVALID_STATION } from "../lib/http";

const MINUTE = 60_000;
const DEADLINE_MS = 8_000;

/**
 * GET /api/alerts?station=<id> - the National Weather Service's beach alerts,
 * the day's rip-current risk and the UV index for the station's point. Server
 * side because NWS asks for an identifying User-Agent, and because a browser
 * call would give NWS every visitor's address. Cached for 15 minutes, as Next's
 * data cache kept the NWS answers, but only an answer NWS gave in full: one
 * with a failed call may be missing a warning. Never served stale.
 */
export function alertsRoute(deps: AppDeps, limiter: FixedWindowRateLimiter) {
  return new Hono<AppEnv>().get("/", async (c) => {
    const now = deps.now();
    const budget = checkApiRateLimit(limiter, c.req.raw, "alerts", now);
    if (!budget.allowed) {
      return fail(c, 429, "rate_limited", "Too many requests. Try again in a minute.", rateLimitHeaders(budget));
    }
    const station = resolveStation(c.req.query("station"));
    if (!station) {
      return fail(c, 400, "invalid_station", INVALID_STATION);
    }

    const result = await readThrough({
      cache: await deps.cache(),
      key: cacheKey(c.env.APP_ORIGIN, "alerts", station.id),
      now,
      produce: () => fetchBeachSafetyChecked(station.lat, station.lng, AbortSignal.timeout(DEADLINE_MS)),
      lifetime: (value) => (value.complete ? { freshMs: 15 * MINUTE, staleMs: 0 } : null),
      waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    });
    return c.json(result.safety, 200, PRIVATE_NO_STORE_HEADERS);
  });
}
