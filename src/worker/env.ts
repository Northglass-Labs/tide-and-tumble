/**
 * What the Worker is given at run time.
 *
 * `Env` is generated from wrangler.jsonc by `npm run types` (never written by
 * hand): the bindings ASSETS and VERSION and the plain variable APP_ORIGIN.
 */
export type Bindings = Env;

/** The type parameter every Hono app and route in this Worker uses. */
export interface AppEnv {
  Bindings: Bindings;
}

/** The two things the API reaches outside itself for that tests replace. */
export interface AppDeps {
  /** The current time, in milliseconds since the epoch. */
  now: () => number;
  /** Where answers are kept between requests: one Cloudflare location's cache. */
  cache: () => Promise<Cache>;
  /** Background refreshes running in this app, by cache key (`readThrough`). */
  refreshing: Map<string, Promise<void>>;
}
