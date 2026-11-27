# Tide & Tumble on Cloudflare Workers

Date: 2026-11-27. Status: built on branch `feat/workers-hosting`, not yet
released. The decisions are recorded [below](#decisions); the commands and the
release contract are in [DELIVERY.md](../DELIVERY.md).

Tide & Tumble moves from a Next.js server deployment to Cloudflare Workers on
the free plan: the pages become static files, and one small Worker answers
`/api/*`. Nothing about the product changes for a visitor except two things
this note calls out: their precise location no longer leaves their device, and
the beach pages stop baking live conditions into their HTML.

This document is public. It records engineering decisions and the measurements
behind them. Accounts, identifiers, traffic figures, DNS, the zone's settings
and the operator's cutover steps are kept in the private operations record.

## Before the move

Measured on 2026-11-27, read-only:

- 99 prerendered pages: 88 beach pages (`/tides/<slug>`), 11 region hubs
  (`/regions/<slug>`), plus the home page, the privacy page, the 404 page,
  `sitemap.xml`, `robots.txt` and the web manifest.
- The beach pages were statically generated and regenerated every hour
  (ISR, `revalidate = 3600`). Each one fetched at render time a 30-day NOAA
  tide table, live buoy conditions (water temperature, wind, surf) and the
  National Weather Service's rip-current and UV forecast, and baked all of it
  into the HTML. Region hubs regenerated daily.
- Four route handlers: `/api/tides`, `/api/marine`, `/api/alerts` and
  `/api/nearest`.
- Response headers on every path: `Strict-Transport-Security:
  max-age=63072000` and nothing else of security value (no
  Content-Security-Policy, no `X-Content-Type-Options`, no frame or referrer
  policy). `www` answered 307 to the apex, keeping path and query; `http://`
  answered 308 to `https://`.

## Decisions

The repository keeps the 2026-08-10 public/private boundary: no `docs/adr` or
`docs/runbooks` in the public tree. The engineering decisions are recorded
here instead, with no operator detail.

| Question | Decision |
|---|---|
| Pages | Static export (`output: "export"`); Cloudflare serves them as static assets. |
| What replaces hourly ISR | Nothing is baked that goes stale dangerously. Live data is fetched in the browser; the deterministic tide table is baked and refreshed in the browser from data the page already loads; a nightly release rebuilds the baked copy ([below](#what-replaces-isr)). |
| `/api/nearest` | Removed. The nearest station is computed on the device. |
| `/api/tides` | The Worker, cached per station for 15 minutes, served stale for up to an hour while it refreshes or when NOAA fails. |
| `/api/marine` | The Worker (NDBC does not allow browser calls), keyed by station, cached per station for 10 minutes. |
| `/api/alerts` | The Worker (NWS wants an identifying User-Agent, and calling it from the browser would hand NWS every visitor's address), keyed by station, cached per station for 15 minutes. |
| Abuse and the shared quota | Only `/api/*` runs the Worker; data answers only on the production address; station ids only, from a fixed list; per-client limits; caching bounds the calls upstream ([below](#protecting-the-shared-quota)). |
| Release | The template's commands, with Version URLs off ([D3](#d3-version-urls-off-a-release-is-checked-in-production)). |
| How production is reached | A Workers route that the operator attaches outside this repository; `wrangler.jsonc` never declares one ([below](#reaching-production)). |

### D1. Static export and one API Worker

Northglass apps run on Cloudflare's free plan until a product has a path to
revenue. On that plan every Worker in the account shares 100,000 requests a
day, each request gets 10 ms of CPU and 50 subrequests, and static files are
served at no cost and count against no limit. So the pages are a static
export, and one Hono Worker answers only `/api/*` (`run_worker_first:
["/api/*"]`). The handler logic is the code that ran before; `marine` and
`alerts` are keyed by station id and the Worker resolves the coordinates.

Trade-offs: three Worker requests per beach view (calling NOAA and NWS from
the browser would save two, but would give every visitor's address to NOAA
and NWS, cannot send the User-Agent NWS asks for, and would break the offline
tide copy); every request that reaches a Worker counts, refused or not, so a
patient client can spend the shared allowance here as through any public
Worker; crawlers see a tide table up to a day old instead of an hour.

### D2. Nothing live baked into a page

Alerts, the rip-current risk, the UV index and buoy conditions are fetched by
the page; the tide table is baked with dates and rebuilt in the browser
([What replaces ISR](#what-replaces-isr)). A static page must never show a
stale warning or a stale all-clear. The alerts answer says whether NWS
answered every call (`complete`); when it did not, the page says the safety
data is unavailable and shows whatever warnings did arrive, so a failed lookup
never reads as "no warnings". Until the answer arrives, and in the static
HTML, the page says it is checking NWS beach warnings; without JavaScript a
`<noscript>` line points to weather.gov and the lifeguards; the request is
given up after ten seconds. A Surf Zone Forecast counts only when it was
issued on the beach's own calendar day: NWS lists a week of them, and an
office that stops issuing for the season would otherwise leave a week-old
rip-current risk on the page as today's. Today's forecast speaks for the
beach only through its own zone's section. Silence never stands for a
forecast: a Low risk is shown ("Low rip current risk today (NWS)"), Moderate
and High as advisories, and otherwise the page says which case it is: today's
forecast gives no risk for this beach, none yet today (the newest is from the
last two days), or none being issued this season.

### D3. Version URLs off; a release is checked in production

With Version URLs on, every uploaded version answers at an address of its own
for as long as Cloudflare keeps it, so a superseded version stays callable,
and that address carries the account's `workers.dev` subdomain, which this
public repository and its public Actions logs never name. So `wrangler.jsonc`
sets `"preview_urls": false`, written out (left out, Wrangler keeps whatever
Cloudflare has). `promote` uploads a version, sends it all traffic, checks
production, checks once more if that fails, and rolls back only its own
version. If Wrangler names a version address anyway, it stops before traffic
moves. The cost: a bad build serves production until its check fails and the
rollback lands, up to about three minutes.

### D4. The nightly release only refreshes

The beach pages carry a tide table built with them, so `main`'s head is
rebuilt every night (08:17 UTC, after midnight in every US mainland time
zone) and released through the same checks and rollback, but only while
production already runs it: a nightly run never advances production and
never undoes a rollback, and it never ships a build in which NOAA missed a
beach's table. A bad commit is fixed by a revert on `main`. Visitors are
unaffected if it fails or skips; only the baked copy ages.

### D5. The build never shares a machine with the release token

The build runs every package's code. On the machine that later holds the
token it could read the token from a process it left running, put a program
of its own on the `PATH`, or rewrite the scripts the release runs, so on
GitHub it runs in a job of its own with no secret (`prepare-release`: a
clean copy of the commit, install scripts off), and the release runs in
another job on a fresh runner, which installs only the locked dependencies
with install scripts off, takes the built `out/` and its record, re-checks
the commit and the digest, and bundles the Worker from its own checkout. The
artifact can carry only static files. On a workstation the two steps are
two commands on one machine, and `prepare-release` refuses to run with a
Cloudflare credential in its environment; a saved Wrangler sign-in is a
file the build could still read, so release from a workstation only after
`npx wrangler logout`. The release token is an account-owned token scoped to
this one Worker with the Workers Editor role: it can upload, deploy and roll
back this Worker and nothing else, so a stolen one could not create, delete
or change any other Worker, or touch DNS or routes. Creating the Worker
needs product-level Admin, used once for the first release. The cost: two
commands, three jobs, and the dependencies installed more than once.

### D6. Dependency holds

TypeScript is held below 6.1 (6.0 is taken) because typescript-eslint
supports TypeScript below 6.1 and TypeScript 7 ships without the compiler API
it and Next's type check call. ESLint is held below 10 because
`eslint-config-next`'s React, import and accessibility plugins declare ESLint 9
at most. Both holds are in `.github/dependabot.yml` with their date and reason
([Dependencies](#dependencies)).

## The four handlers

### Can the browser call the upstream itself?

Checked with `curl` and an `Origin: https://tideandtumble.app` header on
2026-11-27:

| Upstream | Used for | Browser access (CORS) | Other terms |
|---|---|---|---|
| NOAA CO-OPS `datagetter` | tide predictions; wind and water temperature where the tide gauge has sensors | `Access-Control-Allow-Origin: *` | Responses are `no-store`; callers name their application in a parameter |
| NDBC `realtime2` | buoy waves, period, water temperature, wind | **None**: a browser cannot read it | About 200 KB per buoy file; `max-age=600` |
| National Weather Service `api.weather.gov` | rip-current risk, UV index, beach alerts | `*` | Asks every client for an identifying User-Agent with contact details, which a browser cannot set |
| Zippopotam.us | ZIP code to coordinates | `*` | Already called from the browser; unchanged |
| OpenStreetMap tiles | the map picker | `*` | Already loaded by the browser; the tile policy wants attribution and a valid `Referer`, so the referrer policy stays `strict-origin-when-cross-origin` |

Nominatim is not used anywhere in the app.

### `/api/nearest`: no Worker

It never called an upstream: it measured the distance to each of the 3,498
NOAA tide-prediction stations bundled with the app and returned the closest
six. The browser can do that. The station list loads on demand, only when
someone taps "Near me" or enters a ZIP code (about 70 KB gzipped), and the
computation takes about 1.2 ms. The precise coordinates from the browser's
geolocation never leave the device, which is stronger than the old promise
("sent once in a protected request body"). The privacy page says so.

### `/api/tides`, `/api/marine`, `/api/alerts`: the Worker

`marine` must stay on a server because NDBC sends no CORS header. `tides` and
`alerts` could be called from the browser, and that would save one Worker
request each per page view. They stay in the Worker because:

- a direct call hands every visitor's IP address and chosen beach to NOAA and
  NWS; today only the host sees it;
- NWS asks for an identifying User-Agent, which only a server can send;
- the service worker's offline copy of the tide predictions works on the
  same-origin `/api/tides` answer;
- the Content-Security-Policy can keep `connect-src` to this site and
  Zippopotam.

Each costs at most one Worker request per beach shown, and cached answers
cost NOAA and NWS nothing ([traffic](#traffic-and-the-shared-quota)).

The handlers' logic is ported unchanged from the route handlers: the tide
maths, the NDBC column parsing, the SRF parsing and the upstream timeouts and
size limits are the same code in `src/lib/`. What changed:

- **Station-keyed requests.** `/api/marine` and `/api/alerts` take a station id
  only, from the same fixed list `/api/tides` validates against (the 3,498 NOAA
  stations plus the curated beaches). The Worker looks up the coordinates: the
  curated beach's own for a curated id, the NOAA station's otherwise. Those are
  the coordinates the page sent before, so the answers are the same; a request
  can no longer make the Worker query NWS or NDBC for an arbitrary point, and
  every answer can be cached by station.
- **Errors** follow the Northglass shape, `{ "error": "<code>", "message":
  "<sentence>" }`. NOAA's own error text is no longer passed through.
- **Caching** uses the Cache API instead of Next's data cache (next section).

### CPU and subrequests

The free plan allows 10 ms of CPU and 50 subrequests per request. Measured in
Node on this machine (the same V8):

| Work | CPU |
|---|---|
| Parsing the bundled station list and building the allow-list (once per isolate) | 1.3 ms |
| Parsing one 200 KB NDBC buoy file the way `marine.ts` does | 0.06 ms (0.09 ms cold) |
| Parsing a 33-day NOAA hi/lo answer (6 KB) | 0.014 ms |
| Parsing an NWS point and alerts answer | 0.008 ms |

Subrequests: `tides` makes 1, `alerts` at most 4, `marine` at most 10 (the
five nearest NDBC stations and the three nearest wave buoys, up to eight,
each read only to its first data row by its upper-case id; then wind and
water temperature at the tide gauge), plus one cache read and one cache
write each. Waiting on the network is not CPU time.

## Caching

The previous host cached the `/api/tides` answer at its edge for 15 minutes
(`s-maxage=900`) and served it stale for up to an hour while refreshing
(`stale-while-revalidate=3600`). The other two answered `private, no-store`,
but Next's data cache kept the upstream answers they were built from for 10
(NDBC, CO-OPS) and 15 (NWS) minutes.

The Worker does the same with the Cache API, per station:

| Answer | Fresh | Then |
|---|---|---|
| `/api/tides` | 15 minutes | served stale for up to an hour while one refresh runs in the background, and also when NOAA fails |
| `/api/marine` | 10 minutes | refetched |
| `/api/alerts` | 15 minutes when NWS answered every call; 1 minute when it did not | refetched; a stale rip-current risk is never served |

The browser sees the same `Cache-Control` as before: `public,
s-maxage=900, stale-while-revalidate=3600` for tides, `private, no-store`
for the rest. The Cache API is per Cloudflare location and works on the
zone's own address, not on `workers.dev`, where the data API does not answer
anyway.

Cloudflare's newer "Workers Cache" (`"cache": { "enabled": true }` in
`wrangler.jsonc`) is a different feature and is refused by a test: with it
on, every request to the Worker is billed, static files included, and on the
free plan they would count against the daily limit.

## Traffic and the shared quota

The account's free plan allows 100,000 Worker requests a day, shared by every
Worker in it. Static files are free and do not count.

**Measured.** The account's current Worker use leaves most of the shared
allowance free; the figures are in the private operations record.

**Not measured: today's API traffic.** The previous host's plan gives no
request counts for the API routes, and the handlers do not log.

**Estimate.** A beach view makes three Worker requests (tides, marine,
alerts); changing beaches makes three more. At 1,000 beach views a day that is
about 3,000 requests a day, 3% of the account's allowance; ten times that is
still a third of it. Scanners' requests for unknown paths
cost nothing unless they are under `/api/` ([below](#protecting-the-shared-quota)).

## Protecting the shared quota

Two different risks:

- **Spending the quota.** Every request that reaches the Worker counts, even
  one it refuses at once. No Worker code can stop a determined client from
  spending requests; only keeping requests away from the Worker can.
- **Using the Worker as a proxy.** Making it call NOAA, NWS or NDBC on someone
  else's behalf, at volume.

What the build does:

1. **Only `/api/*` runs the Worker** (`run_worker_first: ["/api/*"]`). Pages
   and files never invoke it, and neither does a path that matches no file:
   Cloudflare's documentation does not say so outright, so it was checked in
   `wrangler dev` 4.167 with a probe Worker that marks every answer it
   touches. `/wp-login.php` got the 404 page with no mark; `/api/x` got the
   mark. So scanners' guesses outside `/api/` cost nothing. Should that
   change, the Worker hands any non-API request straight back to the static
   files.
2. **Data answers only on the production address.** On `workers.dev` and any
   other host, only `GET /api/health` answers; everything else under `/api`
   is 404. So the zone's security settings and cache always sit in front of
   the data API, and a request cannot go around them.
3. **Fixed inputs.** A station id must be one of the bundled ids; nothing else
   reaches an upstream. Coordinates are never taken from the request. Upstream
   hosts are fixed, redirects are refused, every call has a timeout and every
   body a size limit (ported from `upstream.ts`).
4. **Caching bounds the upstream calls.** At most one refresh per station per
   cache period per Cloudflare location, however many requests arrive.
5. **Per-client limits** (ported from `api-guard.ts`): per minute, 60 tide,
   30 marine and 30 alert requests per client address (IPv6 by its /64),
   counted after the station is found valid, and an overall cap per Worker
   instance that counts only requests that would ask an upstream (a miss it
   refuses answers 429). Workers keeps them per instance, so
   they slow one noisy client rather than enforce an exact limit; they stop
   the Worker being driven hard against NOAA, not the spending of requests.
6. **Methods.** `GET` and `HEAD` only; no CORS headers, so other sites'
   pages cannot read the answers.

What it cannot do on the free plan, stated plainly: a client that sends
about one request a second for a day spends the account's whole allowance,
here or through any other public Worker in the account. Rules on the zone can
stop some requests before they reach the Worker; which ones are set is the
operator's. Once the allowance is spent, Cloudflare answers `/api/*` with an
error until midnight UTC and the app shows its "unavailable" states.
Cloudflare's documentation says static files are free and unlimited, but it
does not establish that pages served through a route keep loading then: the
route's fail mode decides, and the operator sets it.

## What replaces ISR

The brief for this work assumed the pages change only when the station or
region lists change. The region hubs and the home page do. The beach pages do
not: they carried a dated tide table, the day's high and low times, the
current buoy conditions and the NWS rip-current risk, refreshed hourly.

A static file cannot refresh itself, so the content is split by how it ages:

| Content | Ages | Now |
|---|---|---|
| Rip-current risk, alerts, UV index | Hours; a stale "no warning" is dangerous | Fetched by the page from `/api/alerts`, never baked. Before, they were baked into the HTML and replaced once the page loaded |
| Water temperature, wind, surf | Hours | Fetched by the page (the live chips in the app). The separate "Current conditions" paragraph is no longer baked with numbers |
| The 30-day tide table and "today's" high and low | Deterministic; only "today" moves | Baked at build time with explicit dates, then rebuilt in the browser from the 32-day predictions the page already loads for the live chart, so a visitor always sees today's table. No extra request |
| "Today" in the page header | Daily | Set by the browser |
| Titles, intro, FAQ, links | When the code changes | Baked. The FAQ states no time or moon phase as today's: its "today" question points at the table |

A nightly release rebuilds the baked copy, so what crawlers and readers
without JavaScript see is at most a day old (`deploy.yml`, scheduled at 08:17
UTC, after midnight in every US mainland time zone; [D4](#d4-the-nightly-release-only-refreshes)).
If it fails, skips or is turned off, visitors are unaffected (their table is
rebuilt in the browser); only the baked copy ages. A build that cannot reach
NOAA for a beach renders that beach's page with the existing "temporarily
unavailable" note (marked `data-tide-table="unavailable"`), and the browser
fills the table in; a push's release ships it, a nightly refresh does not.

The region hubs and the home page change only with the code and need nothing.

## Headers

`public/_headers` applies to every static file, and the Worker sets the same
security headers on its own answers.

| Header | Before | Now |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000` | the same (the `.app` top-level domain is HSTS-preloaded already) |
| `Content-Security-Policy` | none | `default-src 'self'`; scripts and styles from the site, inline allowed (Next.js writes inline scripts into every exported page); images also from `data:`, `blob:` and the OpenStreetMap tile server; connections to the site and Zippopotam; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests` |
| `X-Content-Type-Options` | none | `nosniff` |
| `X-Frame-Options` | none | `DENY` |
| `Referrer-Policy` | browser default | `strict-origin-when-cross-origin` (written out; the tile server needs a referrer) |
| `Permissions-Policy` | none | geolocation for the site itself only; camera, microphone, payment and USB off |
| `Cross-Origin-Opener-Policy` | none | `same-origin` |
| `X-Robots-Tag` | none | `noindex` on the `workers.dev` address only, so the copy there never competes with the real one |

Next's hashed files under `/_next/static/` are cached for four hours
(`must-revalidate`); the previous host sent a year as `immutable`. A year was
rejected because a `_headers` rule also applies to the 404 for a file that is
not there (checked in `wrangler dev`): while a release spreads, a browser can get
a page from a location on the new version and ask for its files at one still on
the old version, and would then keep that 404 for a year. The service worker
already keeps these files for visitors who return. Everything else revalidates
(Cloudflare's default).

## Release

The six commands are the template's (`verify`, `build`, `preview`,
`promote`, `health`, `rollback`), plus `audit`. Differences for this app:

- No database: no migrations step, and `/api/health` reports the version
  only.
- The build is `next build` (pages into `out/`), run by `prepare-release`
  with no credential in reach ([D5](#d5-the-build-never-holds-the-release-token));
  Wrangler bundles the Worker from `src/worker/index.ts` at upload. A build
  that holds a dotfile or a key-like file is refused, as the template does.
- Version URLs are off ([D3](#d3-version-urls-off-a-release-is-checked-in-production)):
  `promote` uploads, sends all traffic to the new version, checks production,
  and rolls back if it fails twice.
- Where production is checked: `https://tideandtumble.app` by default, but
  only after `promote` has confirmed that the address is served by this
  Worker (it must answer with the live version); otherwise it refuses and
  says to name the Worker's own `workers.dev` address with `--origin`. That is
  how the first release, before the cutover, is checked, and how a fix is
  released while production cannot answer. The `workers.dev` address is never
  written into this public repository.
- Output that the scripts print is scrubbed of email addresses, account ids
  and the `workers.dev` subdomain, because this repository's Actions logs are
  public.

## Reaching production

Production is reached through a Workers route on the site's own zone, which
the operator attaches outside this repository. `wrangler.jsonc` never declares
a route or a custom domain, and a test refuses both, so no deploy can attach
or move one (Wrangler silently replaces a hostname's DNS record when it
attaches a custom domain without a terminal). `www` keeps redirecting to the
apex with path and query. The steps, and how to go back to the previous host,
are in the private operations record.

## Dependencies

All on Node 26, the template's version (`.node-version`). The open alert
(minimatch, a development-only path under typescript-eslint) is fixed by
moving typescript-eslint to 8.74. Dependabot's grouped major update:

| Package | Taken | Why |
|---|---|---|
| lottie-react 3 | yes | named exports; the data prop is `src`; the emoji use the light build |
| motion 14 | yes | only `useReducedMotion` is used |
| @types/node 26 | yes | matches Node 26 |
| jsdom 31, vitest 5 | yes | need Node 22 or newer (`Iterator`); CI ran Node 20, which is why the group failed |
| TypeScript 7 | no, 6.0 instead | typescript-eslint 8.74 supports TypeScript below 6.1, and TypeScript 7 ships without the compiler API it and Next's type check use |
| ESLint 10 | no | `eslint-config-next`'s React, import and accessibility plugins declare ESLint 9 at most; taking 10 means dropping those rules |

Both holds are pinned in `.github/dependabot.yml` with the date and reason.

## Not in this change

- **One API request per beach view.** A beach view makes three Worker
  requests (tides, marine, alerts). One combined `/api/beach` answer could
  keep each part's own cache entry and lifetime, so the Worker's caching
  would not change; it needs the page to take the three parts' separate
  failures from one answer, and the service worker's offline copy of the
  tides moved to it. A follow-up.
- **The `workers.dev` address off after the cutover** (`workers_dev: false`):
  once production is reached through the route, the Worker's own address
  only serves the release check of last resort. Turning it off removes a
  second public address for the same Worker, and `--origin` with it.
- **A script-hash Content-Security-Policy** instead of `'unsafe-inline'`
  scripts: possible with a post-build step that hashes each page's inline
  scripts; it needs a browser test suite to be safe, which the repository
  does not have yet.
- **The Lighthouse budget** from the template; the size of the first page
  load is not budgeted yet either.
- **The Workers Rate Limiting binding**, a sturdier per-client limit than the
  in-memory one, once its free-plan availability is confirmed.
- **Redirects and status codes that differ from the previous host**, checked
  in `wrangler dev` 4.167:
  - A trailing slash (`/tides/nags-head/`) gets Cloudflare's 307 to the
    canonical address; the previous host sent 308. Both keep the path.
  - Next's per-segment payloads (`__next.tides.$d$slug.__PAGE__.txt`), which
    it prefetches for every beach link in view, get a 307 to the `%24` form
    of their name, then the file: two requests for each, about 64 extra on
    the home page. Static requests are free and count against no limit, and
    no setting changes the redirect; turning prefetching off would trade it
    for slower navigation, so it stays. (An earlier note blamed this redirect
    for a failed service-worker fetch; that was a stale local `wrangler dev`
    state, not Cloudflare. The service worker leaves requests with a query to
    the browser so that a query never becomes a cache key.)
  - The payloads themselves (`*.txt`) answer 200 here; on the previous host
    the same addresses answered 404.
  - `/404`, the 404 page asked for by its own name, is a file and answers
    200; every other unknown path gets that page with a 404. Only a Worker
    could change that status, and pages never run the Worker, so `/404`
    carries `X-Robots-Tag: noindex` instead. Next's own `_not-found` page is
    not uploaded (`public/.assetsignore`), so `/_not-found` is a 404.
- **Retiring the previous host**, after the hold.
