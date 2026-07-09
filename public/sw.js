// Tide & Tumble offline support. Keeps the app shell + the last beach you viewed
// available with no connection: network-first for pages/API (so data stays
// fresh online) with a cache fallback, cache-first for static assets. Only
// same-origin GETs are touched — NOAA/NDBC/OSM/NWS requests pass straight
// through so we never serve stale third-party data.

const CACHE = "tnt-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  const isApi = url.pathname.startsWith("/api/");
  const isNav = req.mode === "navigate";

  if (isApi || isNav) {
    // network-first: fresh when online, last-cached when offline
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((m) => m || (isNav ? caches.match("/") : undefined)),
        ),
    );
    return;
  }

  // static assets: cache-first, then fill the cache
  event.respondWith(
    caches.match(req).then(
      (m) =>
        m ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
    ),
  );
});
