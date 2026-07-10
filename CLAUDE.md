@AGENTS.md

# Tide & Tumble — orientation for Claude Code

A whimsical, animated **US tide-chart** web app (Next.js 16 + React 19 + Tailwind v4).
No backend of its own, no database, no secrets — all data is from free/keyless public
APIs at request time.

**Start here:**
- `README.md` — what it does, stack, data sources, project layout, how to run.
- `DEPLOYMENT.md` — **how it's hosted (Vercel), the `tideandtumble.app` domain/DNS
  setup, and the exact steps to ship a change.** Read this before deploying or touching
  DNS.

**Conventions that matter:**
- **Next.js 16 is not the version in your training data** (see `AGENTS.md`) — check
  `node_modules/next/dist/docs/` before writing framework code.
- The animated scene (`src/components/TideHero.tsx`) is **pure SVG + CSS keyframes**
  (all keyframes in `src/app/globals.css`). Don't drive SVG `<g>` transforms with a JS
  animation lib — it clobbers child transforms. Nest groups instead (static outer,
  animated inner).
- **Every animation needs a `prefers-reduced-motion` static fallback.**
- **Status copy is "one voice per layer"** (`docs/adr/003`): scene badge = direction
  word, ONE whimsical headline (pool in `src/lib/copy.ts`), chips = numbers, creature
  tap-quips = invited whimsy. Never add a second persistent status line.
- **Theme-dependent styling goes through CSS custom properties** (`--star-op`,
  `--beam-op`, `--color-surface`, night-only classes like `.ocean-foam-bio`) — the
  SVG/JSX markup stays identical across all five palettes. UI tint surfaces use
  `bg-surface`, never `bg-sky-bottom` (dark at night → illegible).
- **Playwright testing gotcha:** the service worker intercepts `/api/tides`, hiding it
  from `page.route()` — and it re-registers on every page load with `clients.claim()`,
  so a one-time unregister doesn't stick. To force a tide state for screenshots, skip
  the data layer entirely: set the water group's inline `translateY` directly
  (96 = high, 250 = low).
- **Only add CC0 / MIT / Apache / public-domain assets** and record them in the relevant
  `public/**/CREDITS.md` — this is a public deploy.
- `npm run build` must pass before any deploy.

**Workflow:** feature branch → PR into `main` → Vercel preview URL → merge → prod
(auto-deploys on push to `main`). See `DEPLOYMENT.md` §5.

**Northglass Labs product (public).** Repo is `github.com/Northglass-Labs/tide-and-tumble`
(public since 2026-07-09; all-rights-reserved © Northglass LLC — see `docs/adr/002`).
Public identity: contact **hello@northglass.io**, git authorship the GitHub noreply —
**no personal email in any committed artifact** (Public Identity Rule). Privacy policy at
`/privacy` links to the parent `northglass.io/privacy`. Listed on `northglass.io/tools`.

**Hosting facts live in the homelab, not here** —
`~/Projects/02-Personal/HomeLab/hosting/tide-and-tumble.md` is authoritative for the
Vercel project, the `tideandtumble.app` Cloudflare zone, DNS, and Search Console. Notable
gotcha: **Vercel Git auto-deploy is unreliable — deploy explicitly via the Vercel REST API
after merging** and confirm the prod alias moved (see the hosting doc).
