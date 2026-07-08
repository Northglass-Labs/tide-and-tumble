# Homelab handoff — Tide & Tumble

Paste-ready brief for the Claude Code agent taking over development on the homelab
(Mac mini). Read alongside `CLAUDE.md`, `README.md`, and `DEPLOYMENT.md`.

---

## Quick start

```bash
git clone https://github.com/tomstetson/tide-and-tumble
cd tide-and-tumble
npm install
npm run dev      # http://localhost:3000
npm run build    # must pass before any deploy
```

Then read `DEPLOYMENT.md` before deploying or touching DNS.

---

## Project state (already done — do NOT redo)

- The app is fully imported at the **repo root** and builds clean (`npm install && npm run build`).
- Hosted on **Vercel** — project **`obx-tides`**, team **`tom-stetsons-projects`** — connected
  to **this repo** with **Root Directory empty** and **production branch `main`**.
- **Pushing to `main` auto-deploys to production**; PRs get preview URLs.
- Live at **https://obx-tides.vercel.app** (verified serving this repo's build).

## First task — finish the custom domain `tideandtumble.app`

Registered at **Namecheap**, already **attached to the Vercel `obx-tides` project**. It only
needs DNS. Use the Namecheap/Cloudflare tooling in the homelab folder.

1. **Preferred — Cloudflare zone:** add `tideandtumble.app` in Cloudflare, set the domain's
   **nameservers at Namecheap** to the Cloudflare pair, then create:
   - `A` — host `@` — value `76.76.21.21` — **DNS only (grey cloud), NOT proxied**
   - `CNAME` — host `www` — value `cname.vercel-dns.com` — DNS only
   - *(Or just add those two records in Namecheap Advanced DNS to skip Cloudflare.)*
   - Proxying (orange cloud) in front of Vercel double-CDNs and breaks SSL on `.app` — keep it grey.
2. `.app` is HTTPS-only (HSTS preload); **Vercel auto-issues the TLS cert** once DNS resolves —
   do not set up a cert yourself.
3. **Verify:**
   ```bash
   dig +short tideandtumble.app          # → 76.76.21.21
   dig +short www.tideandtumble.app      # → cname.vercel-dns.com
   curl -sI https://tideandtumble.app | head -5   # → HTTP/2 200
   npx vercel domains inspect tideandtumble.app
   ```
4. Optionally redirect `obx-tides.vercel.app` → `tideandtumble.app` in Vercel → project → Domains.

## Vercel auth

Authenticate the CLI with `npx vercel login` (or a token from
https://vercel.com/account/tokens stored in your vault — **never commit it**). The throwaway
token used during initial cloud setup should be **revoked**.

## Conventions that matter

- **Next.js 16 is not the version in your training data** — check `node_modules/next/dist/docs/`
  before writing framework code (see `AGENTS.md`).
- The animated scene (`src/components/TideHero.tsx`) is **pure SVG + CSS keyframes** (all
  keyframes in `src/app/globals.css`). Don't drive SVG `<g>` transforms with a JS animation
  lib — nest groups instead (static outer, animated inner).
- **Every animation needs a `prefers-reduced-motion` static fallback.**
- **Only add CC0 / MIT / Apache / public-domain assets**, recorded in the relevant
  `public/**/CREDITS.md`. This is a public deploy.
- `npm run build` must pass before any deploy.

## Feature backlog (from DEPLOYMENT.md §7)

1. **Per-beach indexable pages** (`/tides/<beach-slug>`) with SSG + sitemap + metadata — the
   real SEO unlock for "\<beach\> tide chart" searches (currently one client-rendered route).
2. **Favorites / recent beaches** + **shareable beach links** (`/?beach=<stationId>`).
3. **Offline support** (service worker caching the last beach's 30-day window).
4. **Rip-current / beach-advisory / UV** overlays from NWS / state feeds.

## Note on history

Imported from `tomstetson/Misc-Projects` (subfolder `obx-tides/`). That repo's PR #2
("tide-direction-eggs") contains the same tide-direction + Easter-egg work that is already
merged into this repo's `main` and deployed — it's **superseded and can be closed**. All
future work happens in this repo.
