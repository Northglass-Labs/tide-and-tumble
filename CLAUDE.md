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
- **Only add CC0 / MIT / Apache / public-domain assets** and record them in the relevant
  `public/**/CREDITS.md` — this is a public deploy.
- `npm run build` must pass before any deploy.

**Workflow:** feature branch → PR into `main` → Vercel preview URL → merge → prod. See
`DEPLOYMENT.md` §5.
