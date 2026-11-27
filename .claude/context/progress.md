# Progress

The shared, public handoff record for this repository. Operations detail
(accounts, DNS, the cutover steps, monitoring) belongs in the private
operations record, never here (the 2026-08-10 boundary).

## Active objective

Move Tide & Tumble from a Next.js server deployment to Cloudflare Workers on
the free plan, and bring the repository to the Northglass app standard
(branch `feat/workers-hosting`, draft pull request). The release and the
cutover are the operator's, after an adversarial review.

## Plan and state (2026-11-27)

1. Design note with its Decisions section: done
   (`docs/specs/2026-11-27-workers-hosting.md`; no `docs/adr`, by the
   repository's boundary).
2. Dependencies: done. Node 26; lottie-react 3, motion 14, @types/node 26,
   jsdom 31, vitest 5 taken; TypeScript held below 6.1 (6.0 taken) and
   ESLint 10 held, both pinned in `dependabot.yml` with the reason; the
   minimatch alert (GHSA-g3hv-75wg-m249) cleared by typescript-eslint 8.74;
   `npm audit` reports nothing.
3. API Worker: done (`src/worker/`): tides, marine, alerts by station id,
   Cache API per station, data only at `APP_ORIGIN`, per-client limits.
4. Static export: done. No live data baked into pages; the tide table is
   rebuilt in the browser; the nearest station is computed on the device;
   the privacy page says so.
5. Release commands, headers, build check: done (from the app template, with
   Version URLs off and production checked only once confirmed).
6. `.github/`: done (CI with the audit and the Dependabot merge job, Deploy
   with a nightly release, the daily Audit, grouped Dependabot).
7. Docs: done (`AGENTS.md`, `CLAUDE.md`, `docs/DELIVERY.md`, README).
   `DEPLOYMENT.md` is folded into `docs/DELIVERY.md`.
8. Review fixes (2026-11-27): done. The 2026-08-10 boundary kept (no
   `docs/adr`; decisions in the design note), operator detail out of the
   public docs; alerts say when NWS did not answer in full; the account id is
   a secret; the build runs in `prepare-release` without the token and
   `promote` runs only Wrangler; the nightly run only refreshes what
   production runs; the release check asks the data API; the limiter, the
   merge gate, the FAQ, the Lottie chunk, `/_not-found` and single-flight
   refreshes fixed; weak tests pinned. Not done here: one API request per
   beach view (a follow-up, in the design note).

## Verification

- `npm run verify` passes locally after the review fixes (see the pull
  request for the count), and in a clean detached copy of the commit
  installed with `npm ci --ignore-scripts`: no install script is needed.
- Headless Chrome against `npm run preview`, fresh profile: home, a beach
  page, a region hub and the privacy page load with no console message (no
  CSP refusal, hydration error or failed fetch); the beach page rendered the
  live tide state, buoy conditions and the 30-day table.
- `npm audit`, all dependencies and production only: no advisories.
- `npm run preview` (`wrangler dev`): pages, headers, the 404 page and the API
  against the real NOAA, NDBC and NWS answer as expected; a path matching no
  file never runs the Worker.

## Next

- The coordinator's re-review of the fixes.
- The operator's first release to the Worker's `workers.dev` address
  (`node scripts/prepare-release.mjs`, then
  `npm run promote -- --origin <address>`), the cutover, the hold, then
  turning on releases from GitHub (`docs/DELIVERY.md`, "Turning it on").
- Follow-ups: one API request per beach view; `workers_dev: false` after the
  cutover; the station time-zone and NDBC fixes below.

## Known issues (separate from this change)

- Every station uses `America/New_York` for "now", so Gulf and Pacific beaches
  show the live tide state one to three hours off.
- NDBC coastal stations with lettered ids are requested in lower case and
  answer 404, so they never contribute conditions; their files also exceed
  the 256 KB read cap, so the reader should stop at the first data row.
- From before: the owner's real-iPhone spot check (calendar wheel, hero swipe,
  safe area) is still open.
