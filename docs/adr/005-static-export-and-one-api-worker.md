---
status: accepted
date: 2026-11-27
---

# ADR-005: Static export and one API Worker on the free plan

ADR-001 to ADR-004 predate the public repository and are kept privately
(ADR-007); numbering continues from them.

## Context

Northglass apps run on Cloudflare's free plan until a product has a path to
revenue. On that plan every Worker in the account shares 100,000 requests a
day, each request gets 10 ms of CPU and 50 subrequests, and static files are
served at no cost and count against no limit.

Tide & Tumble was a Next.js 16 server deployment: 99 prerendered pages
regenerated hourly (ISR), and four route handlers that call NOAA CO-OPS, NDBC,
the National Weather Service, or nothing at all (`/api/nearest`). The beach
pages baked live buoy conditions and the NWS rip-current risk into their
HTML. The measurements and the per-handler analysis are in
`docs/specs/2026-11-27-workers-hosting.md`.

## Decision

- **Pages:** `output: "export"`. Cloudflare serves the result as static assets;
  unknown paths get the exported 404 page with status 404.
- **No ISR:** live data (alerts, rip-current risk, UV, buoy conditions) is never
  baked into a page; the browser fetches it. The deterministic tide table is
  baked with explicit dates and rebuilt in the browser from the predictions the
  page already loads. A nightly release refreshes the baked copy.
- **`/api/nearest` is removed:** the browser computes the nearest station from
  the bundled list, loaded on demand. Precise location never leaves the device.
- **One Hono Worker answers `/api/*`** (`run_worker_first: ["/api/*"]`):
  `/api/tides`, `/api/marine`, `/api/alerts` and `/api/health`. The handler
  logic is the code that ran on Vercel. `marine` and `alerts` are keyed by
  station id; the Worker resolves coordinates from the bundled list.
- **Caching:** the Cache API, per station: tides 15 minutes fresh and up to an
  hour stale (while refreshing, or when NOAA fails); marine 10 minutes; alerts
  15 minutes and never stale.
- **Protection:** data answers only on the production address; inputs are
  bundled station ids only; fixed upstream hosts, timeouts and size limits;
  per-client limits; `GET` and `HEAD` only; no CORS.
- **Reaching production:** a Workers route on the site's own zone, attached by
  the operator outside this repository. `wrangler.jsonc` never declares a route
  or a custom domain.

## Trade-offs

- **Three Worker requests per beach view** (tides, marine, alerts). Calling
  NOAA and NWS from the browser would save two, but would give every
  visitor's address to NOAA and NWS, cannot send the User-Agent NWS asks
  for, and would break the offline tide copy. The account had about 93,500
  of its 100,000 daily requests free when this was decided.
- **The quota can be spent by anyone patient.** Every request that reaches a
  Worker counts, refused or not, and the free plan's one rate-limiting rule
  counts over 10 seconds. This is true of every public Worker in the account.
  The design keeps page views off the Worker and upstream calls bounded; it
  cannot make the quota unspendable.
- **Crawlers see a tide table up to a day old** instead of up to an hour old,
  and no baked buoy numbers. Visitors with JavaScript see today's.
- **The nightly release is an automatic production change** without a new
  commit. It deploys the reviewed head of `main` through the same checks and
  rollback as any release.
- **A route, not a custom domain:** Cloudflare recommends a custom domain when
  the Worker is the origin. The route keeps the rollback to one call with no
  DNS change while the previous host still exists; converting to a custom
  domain is a later, separate change.

## Consequences

- Page views never count against the daily limit. If the limit is spent,
  `/api/*` fails until midnight UTC and the pages keep loading with their
  "unavailable" states.
- The station list is bundled in the Worker (about 300 KB, parsed once per
  instance in about 1.3 ms) and loaded lazily by the browser.
- A new page is a Next.js route that exports statically, never a Worker
  route. Anything a page needs at request time goes through `/api/*` and is
  counted.
- The privacy page changes: location stays on the device, and the host is
  Cloudflare.
