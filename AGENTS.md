<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tide & Tumble: instructions for agents

Tide & Tumble is a public, whimsical US tide chart at https://tideandtumble.app,
a Northglass product. The pages are a Next.js 16 static export (React 19,
Tailwind CSS v4) served by Cloudflare Workers static assets; one small Hono
Worker answers `/api/*` with NOAA tide predictions, NDBC and NOAA marine
conditions and National Weather Service beach safety data. No accounts, no
database, no secrets. It runs on Cloudflare's free plan.

Read `README.md` for the tour, `docs/DELIVERY.md` before releasing, and
`docs/specs/2026-11-27-workers-hosting.md` (its Decisions section) for why it
is built this way.

## Rules that do not bend

- **Free plan only.** No paid Cloudflare feature and no other paid service.
  The limits are in `docs/DELIVERY.md`. Every Worker in the account shares
  100,000 requests a day.
- **Pages are static files.** Only `/api/*` runs the Worker. A page that would
  need a server at request time cannot be exported; `next build` refuses it.
  Never add a route that makes a page view cost a Worker request.
- **Nothing live is baked into a page.** Alerts, the rip-current risk, the UV
  index and buoy conditions are fetched by the page; a static page must never
  show a stale warning or a stale all-clear. The tide table is baked with
  dates and rebuilt in the browser.
- **A precise location never leaves the device.** The nearest station is
  computed in the browser from the bundled list.
- **The API takes station ids, never coordinates**, and its data routes answer
  only at `APP_ORIGIN`. Upstream hosts are fixed; redirects are never
  followed; every call has a timeout and every body a size limit.
- **Keep the Worker light.** 10 ms of CPU and 50 subrequests per request. Do
  not rewrite the tide maths in `src/lib/tides.ts` without tests from real
  NOAA data.
- **Write the failing test first**, see it fail, then write the code.
- **Every API answer is JSON.** Errors are
  `{ "error": "<code>", "message": "<plain sentence>" }`, never an upstream's
  own text.
- **This repository is public.** The only contact address is
  `hello@northglass.io`. Never commit a personal email or name, a private
  path, a provider account identifier (account, zone or route ids, the
  account's `workers.dev` subdomain), a credential or where one is kept, DNS
  administration, incident notes or recovery procedures. Those live in the
  private operations record. There is no `docs/adr` or `docs/runbooks` here;
  decisions go in the design note's Decisions section.
  `test/app/opsec.test.ts` scans for all of it.
- **Never bypass a git hook.** If a commit or push is refused, fix the cause
  or stop and report.
- **Wrangler reads only `wrangler.jsonc`.** Give any Wrangler command
  `--config wrangler.jsonc`, and never add a `wrangler.json` or
  `wrangler.toml` here or above. Never declare a route, a custom domain or
  Workers Cache there; `test/scripts/project.test.ts` refuses them.
- **Look it up.** Before changing `wrangler.jsonc`, the Next.js config, the
  Vitest setup or the release commands, read the current Cloudflare and
  Next.js documentation. This tooling changes often.

## Engineering conventions

- The animated scene in `src/components/TideHero.tsx` is SVG plus CSS
  keyframes. Do not drive SVG group transforms with a JavaScript animation
  library; nest a static outer group and animated inner group.
- Every animation requires a `prefers-reduced-motion` static fallback.
- Keep one voice per status layer: the scene badge names direction, chips show
  numbers, and one headline carries personality.
- Theme styling belongs in CSS custom properties; keep SVG/JSX markup identical
  across palettes and use `bg-surface` for readable UI tint surfaces.
- Only add CC0, MIT, Apache, or public-domain assets and update the relevant
  `public/**/CREDITS.md`.
- Preserve NOAA/NWS/NDBC attribution and the "not for navigation" warning.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | The Next.js pages, all exported statically: home, `tides/[slug]` (88 beaches), `regions/[slug]` (11 hubs), privacy, sitemap, robots, manifest |
| `src/components/` | The interactive app (`TideApp`), the animated scene, the picker, the beach page's table and date |
| `src/lib/` | Shared by the pages and the Worker: stations and slugs, the tide maths, NOAA/NDBC/NWS fetching (`upstream.ts` holds the limits), the API guard, the SEO builders, the bundled station lists |
| `src/worker/` | The API Worker: `index.ts` (guard, routes, security headers), `routes/`, `lib/cache.ts` (Cache API per station) |
| `public/` | Static files, `_headers` (security and cache headers), `.assetsignore`, the service worker |
| `scripts/` | The delivery commands; `scripts/lib/` holds their tested logic |
| `test/app`, `test/worker`, `test/scripts` | Tests: Node (jsdom by file), the Workers runtime, Node |
| `wrangler.jsonc` | The Worker's name, static assets, bindings and `APP_ORIGIN` |
| `docs/DELIVERY.md` | The delivery contract: commands, release, rollback, limits, releasing from GitHub |
| `docs/specs/` | The hosting design note, with the Decisions section |
| `.github/` | `ci.yml` (verify, audit, the Dependabot merge job), `deploy.yml` (push, dispatch, nightly), `audit.yml` (daily), `dependabot.yml` |

## Commands

| Command | Use it to |
|---|---|
| `npm run dev` | Work on pages with Next's dev server; the API is not served there |
| `npm run preview` | Build and serve everything, the API included, on `localhost:4183` in the Workers runtime |
| `npm test` | Run all tests once |
| `npm run verify` | Check everything: types, lint, tests, the export and its check. Run before every commit that changes code |
| `npm run audit [-- --strict]` | Check the dependencies for known vulnerabilities (needs the network) |
| `node scripts/prepare-release.mjs` | Build and check a clean copy of main's commit with no Cloudflare credential in reach, for `promote` |
| `npm run promote [-- --origin <address>]` | Release what `prepare-release` built and roll back if production is unhealthy; it runs no build |
| `npm run health -- <url>` | Check a running site |
| `npm run rollback -- [versionId] [--origin <address>]` | Go back to the previous version |

If a guard complains that `npm run` puts npm's own bin first on `PATH`, run
the script's file with Node directly (`node scripts/promote.mjs`).

## How to

**Change the API.** Write the test in `test/worker/` first (`testApp()` and
`stubUpstream()` in `test/worker/helpers.ts` control the clock, the cache and
every upstream answer). Handlers live in `src/worker/routes/`; the upstream
logic stays in `src/lib/`.

**Change a page.** Pages must export statically: no request-time APIs, and a
dynamic route needs `generateStaticParams` and `dynamicParams = false`. Live
data comes from `/api/*` in a client component.

**Change a workflow.** Write the failing test in
`test/scripts/workflows.test.ts` first. Pin each action to a full commit with
its version in a comment.

**Release.** State the rollback first (`npm run rollback`), then, from a
clean checkout of `main` that matches GitHub's, `node
scripts/prepare-release.mjs` with no Cloudflare credential in the
environment, then `npm run promote` with the token, and read the JSON lines
they print (`docs/DELIVERY.md`). Once the owner has turned releases on, a
push to `main` releases by itself and the nightly run refreshes what
production runs. A bad commit is fixed by a revert on `main`, after a
rollback.

## Where facts live

- This repository: code, tests, the delivery contract and the engineering
  decisions (the design note).
- The private operations record: where the site is hosted, accounts, DNS, the
  zone route, monitoring, and the cutover and hosting-rollback steps. Do not
  copy those facts here.
- `.claude/context/progress.md`: what is being worked on now. Keep it current
  while you work.
