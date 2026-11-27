/**
 * Answers kept per station in the Cache API, standing in for what Vercel's
 * edge cache (`s-maxage`, `stale-while-revalidate`) and Next's data cache did.
 * The Cache API is per Cloudflare location, so each location refreshes on its
 * own; it does nothing on workers.dev, where the data API does not answer.
 */

/** How long an answer is served as fresh, then as stale while one refresh runs behind it. */
export interface Lifetime {
  freshMs: number;
  staleMs: number;
}

interface Entry<T> extends Lifetime {
  storedAt: number;
  value: T;
}

export interface ReadThrough<T> {
  cache: Cache;
  /** One URL per scope and station; never a client's own request URL. */
  key: string;
  now: number;
  /** Fetches the answer from upstream. */
  produce: () => Promise<T>;
  /** How long to keep this answer, or null to keep it not at all. */
  lifetime: (value: T) => Lifetime | null;
  /** Keeps a refresh running after the answer has gone (`ctx.waitUntil`). */
  waitUntil: (promise: Promise<unknown>) => void;
  /** The refreshes running in this Worker instance, by key: one at a time per key. */
  refreshing: Map<string, Promise<void>>;
  /** Asked before each upstream call (a miss, or a refresh); false refuses it (the instance's shared cap). */
  admit?: () => boolean;
}

/** A miss the instance's shared cap refused: the upstream was not asked. */
export class CapacityReached extends Error {
  constructor() {
    super("the instance's shared cap for this scope is used up");
    this.name = "CapacityReached";
  }
}

/**
 * The answer for `key`: from the cache while it is fresh; from the cache while
 * it is stale, with one refresh started behind it unless one is running in
 * this instance already; otherwise fetched now and stored. A failed refresh
 * leaves the stale answer in place until it expires.
 */
export async function readThrough<T>(options: ReadThrough<T>): Promise<T> {
  const { cache, key, now } = options;
  const entry = await read<T>(cache, key);
  if (entry) {
    const age = now - entry.storedAt;
    if (age >= 0 && age < entry.freshMs) return entry.value;
    if (age >= 0 && age < entry.freshMs + entry.staleMs) {
      if (!options.refreshing.has(key) && (options.admit?.() ?? true)) {
        const refresh = options
          .produce()
          .then((value) => store(options, value))
          .catch(() => undefined)
          .finally(() => options.refreshing.delete(key));
        options.refreshing.set(key, refresh);
        options.waitUntil(refresh);
      }
      return entry.value;
    }
  }
  if (options.admit && !options.admit()) throw new CapacityReached();
  const value = await options.produce();
  await store(options, value);
  return value;
}

async function read<T>(cache: Cache, key: string): Promise<Entry<T> | null> {
  const hit = await cache.match(key);
  if (!hit) return null;
  try {
    const entry = (await hit.json()) as Entry<T>;
    return typeof entry.storedAt === "number" &&
      typeof entry.freshMs === "number" &&
      typeof entry.staleMs === "number"
      ? entry
      : null;
  } catch {
    return null;
  }
}

async function store<T>(options: ReadThrough<T>, value: T): Promise<void> {
  const lifetime = options.lifetime(value);
  if (!lifetime) return;
  const entry: Entry<T> = { ...lifetime, storedAt: options.now, value };
  const seconds = Math.ceil((lifetime.freshMs + lifetime.staleMs) / 1000);
  await options.cache.put(
    options.key,
    new Response(JSON.stringify(entry), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${seconds}`,
      },
    }),
  );
}

/** The cache key for one scope and station. */
export function cacheKey(origin: string, scope: string, stationId: string): string {
  return new URL(`/api/cache/v1/${scope}/${encodeURIComponent(stationId)}`, origin).toString();
}
