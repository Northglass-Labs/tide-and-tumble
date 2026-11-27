import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../env";

/**
 * GET /api/health - is the API up, and which version is answering.
 * `npm run health`, `promote` and `rollback` read it. It calls nothing
 * upstream: NOAA being down is not a reason to roll a release back.
 */
export function healthRoute(deps: AppDeps) {
  return new Hono<AppEnv>().get("/", (c) =>
    c.json(
      {
        ok: true,
        // `tag` is the git commit `promote` uploaded; empty in local development.
        version: { id: c.env.VERSION.id, tag: c.env.VERSION.tag ?? "" },
        time: new Date(deps.now()).toISOString(),
      },
      200,
      { "Cache-Control": "no-store" },
    ),
  );
}
