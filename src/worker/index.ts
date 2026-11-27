import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { FixedWindowRateLimiter } from "../lib/api-guard";
import type { AppDeps, AppEnv } from "./env";
import { fail, logFailure } from "./lib/http";
import { alertsRoute } from "./routes/alerts";
import { healthRoute } from "./routes/health";
import { marineRoute } from "./routes/marine";
import { tidesRoute } from "./routes/tides";

/** The cache the API keeps its answers in (named, so it never meets the zone's own cache keys). */
const CACHE_NAME = "tide-and-tumble-api";

const realDeps: AppDeps = {
  now: () => Date.now(),
  cache: () => caches.open(CACHE_NAME),
};

const READ_METHODS = new Set(["GET", "HEAD"]);

const NOT_FOUND = "There is nothing at this address.";

/**
 * Wraps every API request.
 *
 * First: the data API answers only at the production address (APP_ORIGIN).
 * The same Worker also answers at its workers.dev address, where the zone's
 * security settings and the Cache API do not apply; there only
 * `GET /api/health` answers, which is all the release checks ask.
 * Everything else is 404, before any upstream is asked.
 *
 * Then: only GET and HEAD. There is nothing to send, and no CORS: other
 * sites' pages cannot read the answers.
 *
 * After: every answer tells browsers not to guess its type, not to leak the
 * full address, never to frame or run it, and to keep using HTTPS. Anything
 * that does not say how to cache itself is not stored.
 */
const guard = createMiddleware<AppEnv>(async (c, next) => {
  const ownAddress = new URL(c.req.url).origin === new URL(c.env.APP_ORIGIN).origin;
  const health = c.req.path === "/api/health";
  if (!READ_METHODS.has(c.req.method)) {
    c.res = fail(c, 405, "method_not_allowed", "Only GET and HEAD requests are answered here.", {
      Allow: "GET, HEAD",
    });
  } else if (!ownAddress && !health) {
    c.res = fail(c, 404, "not_found", NOT_FOUND);
  } else {
    await next();
  }

  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Strict-Transport-Security", "max-age=63072000");
  c.res.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (!c.res.headers.has("Cache-Control")) {
    c.res.headers.set("Cache-Control", "no-store");
  }
});

/**
 * The whole back end: three read-only data routes and a health check under
 * /api. Everything else is a static file Cloudflare serves before this code
 * runs (`assets` in wrangler.jsonc), so page views cost no Worker requests.
 *
 * Tests pass their own clock and cache; production uses `realDeps`. Each app
 * keeps its own per-client limits, so a Worker instance has one set.
 */
export function createApp(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = { ...realDeps, ...overrides };
  const limiter = new FixedWindowRateLimiter();

  const api = new Hono<AppEnv>();
  api.use(guard);
  api.route("/health", healthRoute(deps));
  api.route("/tides", tidesRoute(deps, limiter));
  api.route("/marine", marineRoute(deps, limiter));
  api.route("/alerts", alertsRoute(deps, limiter));
  api.notFound((c) => fail(c, 404, "not_found", NOT_FOUND));

  const app = new Hono<AppEnv>();
  app.route("/api", api);

  app.notFound((c) => {
    if (c.req.path === "/api" || c.req.path.startsWith("/api/")) {
      return fail(c, 404, "not_found", NOT_FOUND);
    }
    // Only /api/* runs the Worker first. A path that matches no static file
    // reaches it too: hand it back to the static files, which answer the 404
    // page, and do nothing else.
    return c.env.ASSETS.fetch(c.req.raw);
  });

  app.onError((error, c) => {
    logFailure("internal_error", error);
    return fail(c, 500, "internal_error", "Something went wrong. Try again in a little while.");
  });

  return app;
}

export default createApp();
