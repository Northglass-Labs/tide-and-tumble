// Tide & Tumble offline shell.
//
// Privacy/safety invariant:
// - precise-location, marine, and NWS safety API responses are never persisted;
// - only station-keyed tide predictions may be used offline, for at most 6 hours;
// - cached navigation keys never retain URL query parameters;
// - every cached response is successful and carries an explicit cache timestamp.

const CACHE = "tnt-v2";
const CACHE_PREFIX = "tnt-";
const CACHED_AT = "X-Tide-Cached-At";
const OFFLINE = "X-Tide-Offline";
const TIDE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const NAV_MAX_AGE_MS = 24 * 60 * 60 * 1000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function offlineResponse(message) {
  return new Response(JSON.stringify({ error: message, offline: true }), {
    status: 503,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
      [OFFLINE]: "1",
    },
  });
}

async function copyWithHeaders(response, extraHeaders) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function storeSuccessful(cache, key, response) {
  if (!response.ok) return;
  const stamped = await copyWithHeaders(response.clone(), {
    [CACHED_AT]: String(Date.now()),
  });
  await cache.put(key, stamped);
}

async function readFresh(cache, key, maxAgeMs) {
  const cached = await cache.match(key);
  if (!cached) return null;
  const cachedAt = Number(cached.headers.get(CACHED_AT));
  if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > maxAgeMs) {
    await cache.delete(key);
    return null;
  }
  return { cached, cachedAt };
}

function tideCacheKey(url) {
  const station = url.searchParams.get("station");
  if (!station || !/^\d{6,8}(?:-[a-z0-9-]{1,48})?$/i.test(station)) return null;
  const normalized = new URL("/api/tides", url.origin);
  normalized.searchParams.set("station", station);
  return new Request(normalized);
}

function navigationCacheKey(url) {
  return new Request(new URL(url.pathname, url.origin));
}

async function handleTides(request, url) {
  const cache = await caches.open(CACHE);
  const key = tideCacheKey(url);
  try {
    const response = await fetch(request);
    if (key) await storeSuccessful(cache, key, response);
    return response;
  } catch {
    if (!key) return offlineResponse("Live tide data is unavailable.");
    const hit = await readFresh(cache, key, TIDE_MAX_AGE_MS);
    if (!hit) {
      return offlineResponse("No recent saved tide predictions are available.");
    }
    return copyWithHeaders(hit.cached, {
      [CACHED_AT]: String(hit.cachedAt),
      [OFFLINE]: "1",
    });
  }
}

async function handleNavigation(request, url) {
  const cache = await caches.open(CACHE);
  const key = navigationCacheKey(url);
  try {
    const response = await fetch(request);
    await storeSuccessful(cache, key, response);
    return response;
  } catch {
    const direct = await readFresh(cache, key, NAV_MAX_AGE_MS);
    const root =
      direct ??
      (url.pathname === "/"
        ? null
        : await readFresh(
            cache,
            new Request(new URL("/", url.origin)),
            NAV_MAX_AGE_MS,
          ));
    if (!root) return offlineResponse("The offline app shell is unavailable.");
    return copyWithHeaders(root.cached, {
      [CACHED_AT]: String(root.cachedAt),
      [OFFLINE]: "1",
    });
  }
}

async function handleStatic(request, url) {
  // Never turn arbitrary query strings into durable cache keys.
  if (url.search) return fetch(request);
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await storeSuccessful(cache, request, response);
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/tides") {
    event.respondWith(handleTides(request, url));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    // Location, marine, and safety APIs are network-only by design.
    event.respondWith(
      fetch(request).catch(() =>
        offlineResponse("Live location and beach-safety data is unavailable."),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  event.respondWith(handleStatic(request, url));
});
