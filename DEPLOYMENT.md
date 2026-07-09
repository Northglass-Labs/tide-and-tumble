# Deployment & Operations

Everything needed to build, deploy, and operate **Tide & Tumble** — written so a
fresh Claude Code session (or a human) can take over cold.

---

## 1. TL;DR

- **App:** a Next.js 16 site, no backend of its own, no database, no secrets. All data
  comes from free/keyless public APIs at request time.
- **Host:** Vercel. Production URL today: **https://obx-tides.vercel.app**.
- **Custom domain:** **`tideandtumble.app`** (registered at Namecheap) — already added to
  the Vercel project; needs DNS records pointed at Vercel (see §4).
- **Deploy:** push to the Vercel-connected branch (auto-deploy) **or** `vercel deploy --prod`.
- **No env vars required.** `npm run build` must pass before shipping.

---

## 2. Current hosting state

| Thing | Value |
|---|---|
| Vercel team / scope | `tom-stetsons-projects` |
| Vercel project name | `obx-tides` (predates the rename; the URL is the custom domain) |
| Production URL | `https://tideandtumble.app` |
| Framework preset | Next.js (builds from the repo root) |
| Custom domain | `tideandtumble.app` (Cloudflare DNS, grey-cloud; `obx-tides.vercel.app` 308-redirects) |

> **Deploy reliability note:** Vercel's Git auto-deploy has been unreliable on this
> project — merging to `main` does not always trigger a production build. **Deploy
> explicitly after merging** (see §3), and confirm the production alias moved to the new
> commit via the Vercel API.

---

## 3. Deploying

### Prerequisites (authentication)

The Vercel CLI needs to authenticate. **Never commit a token.** Two options:

```bash
# Interactive (best on the homelab Mac):
npx vercel login          # then `npx vercel link` → team tom-stetsons-projects, project obx-tides

# Non-interactive (CI / headless): use a token from
# https://vercel.com/account/tokens , passed via env — do NOT hardcode it:
export VERCEL_TOKEN=…      # store in your secrets manager / homelab vault, not the repo
```

> A throwaway token was used during initial setup from a cloud session and should be
> **revoked** at https://vercel.com/account/tokens. Mint a fresh one for the homelab.

### Deploy commands

```bash
# From the repo root:
npm run build                       # sanity-check the production build locally first

npx vercel deploy --prod --yes      # build + deploy to production (obx-tides project)
# or a preview build:
npx vercel deploy --yes             # returns a unique preview URL
```

### Git-based auto-deploy (after §2 migration)

Once the Vercel project's Git connection points at this repo:
- **Push to the production branch** (`main`) → Vercel builds and promotes to production.
- **Open a PR / push any other branch** → Vercel posts a **preview deployment** URL on the PR.

### Build settings (Vercel project)

| Setting | Value |
|---|---|
| Framework Preset | Next.js |
| Build Command | `next build` (default) |
| Install Command | `npm install` (default) |
| Output | (default — Next.js) |
| Root Directory | **empty / blank** for this repo — app is at the repo root (see §2). Set under Settings → Build and Deployment. |
| Node.js Version | 20.x or newer |

No Environment Variables are needed in any environment (Production/Preview/Development).

---

## 4. Custom domain & DNS — `tideandtumble.app`

**Status (updated 2026-07-09):** DNS is now **configured via Cloudflare** (the preferred
path below). Done:
- Cloudflare zone `tideandtumble.app` created (account `a76970…`; assigned NS
  `sydney.ns.cloudflare.com` / `wells.ns.cloudflare.com`).
- Records added, **both grey-cloud / DNS-only (NOT proxied)**: `A @ → 76.76.21.21` and
  `CNAME www → cname.vercel-dns.com`. Verified served by Cloudflare's NS directly.
- Namecheap nameservers switched from the default parking NS to the Cloudflare pair
  (via Namecheap API `domains.dns.setCustom`, `Updated: true`).

**Live since 2026-07-09.** `https://tideandtumble.app` serves the production build with a
valid auto-issued Vercel TLS cert, and `obx-tides.vercel.app` **308-redirects** to it.
(During bring-up, Cloudflare's public resolver cached the old Namecheap parking delegation
long after other resolvers updated, which both won the parallel-DoH race on home devices and
stalled Let's Encrypt validation; purging the `1.1.1.1` cache + force-issuing the cert via the
Vercel API cleared it.) `.app` is HTTPS-only (HSTS preload) — Vercel handles the cert; never
set one up by hand.

**Vercel CLI auth:** a token lives in 1Password (Agent vault, item `vercel token
homelab-macmini`). The CLI can hang headless — prefer the Vercel REST API
(`https://api.vercel.com`, `Authorization: Bearer <token>`) for scripted checks.

### Records to create

| Type | Host / Name | Value | Notes |
|---|---|---|---|
| `A` | `@` (apex) | `76.76.21.21` | Vercel's anycast IP |
| `CNAME` | `www` | `cname.vercel-dns.com` | |

Choose where these live:

- **Recommended — Cloudflare** (our standard going forward): add the zone
  `tideandtumble.app` in Cloudflare, set the domain's **nameservers at Namecheap** to the
  two Cloudflare assigns (`*.ns.cloudflare.com`), then create the records above.
  **Set them to "DNS only" (grey cloud), NOT proxied** — proxying in front of Vercel
  double-CDNs and breaks SSL on a `.app` domain. (Cloudflare's CNAME-flattening also lets
  you use `CNAME @ → cname.vercel-dns.com` at the apex instead of the A record.)
- **Simpler — Namecheap only:** skip Cloudflare and add the same two records under
  Namecheap → Advanced DNS. Remove any default parking/redirect records on `@` and `www`.

Vercel's alternative is to set the domain's nameservers directly to `ns1.vercel-dns.com`
/ `ns2.vercel-dns.com`, which hands all DNS to Vercel. We prefer the record-based
Cloudflare path so DNS stays in our own control plane.

### Verify

```bash
dig +short tideandtumble.app          # → 76.76.21.21
dig +short www.tideandtumble.app      # → cname.vercel-dns.com (resolves onward)
curl -sI https://tideandtumble.app | head -5   # → HTTP/2 200, served by Vercel
npx vercel domains inspect tideandtumble.app    # Vercel's view of config + verification
```

Once green, the app answers at `https://tideandtumble.app` and (optionally) redirect the
old `obx-tides.vercel.app` to it in Vercel → project → Domains.

---

## 5. Branching & source control

- **`main`** — production. After the §2 migration, pushing here auto-deploys to prod.
- **Feature branches** — `feature/<slug>` (or `claude/<slug>`); open a PR into `main`.
  Vercel posts a preview URL on each PR. Keep PRs as drafts until the preview looks right.
- This repo began as a subfolder in a personal monorepo and was extracted to its own repo. Earlier
  history lives there; this repo starts clean at the import commit.

---

## 6. Local development

```bash
npm install
npm run dev      # http://localhost:3000 — live NOAA data, hot reload
npm run build    # production build; MUST pass before any deploy
npm run start    # serve the production build at http://localhost:3000
npm run lint
```

There is nothing to configure — no `.env`, no services to run. The app calls public
APIs directly (server routes proxy NOAA/NDBC; the client calls the internal
`/api/*` routes). See README §"Data sources".

---

## 7. Architecture notes for future work

- **No persistence.** Selected beach + audio preference live in `localStorage` only. There
  is no user account, database, or server state. Adding push notifications or saved
  favorites-sync would be the first thing to require a backend.
- **Server routes** (`src/app/api/*`) exist purely to proxy/cache third-party APIs and to
  keep the ~3,500-station dataset server-side. They are stateless and cache-friendly
  (`revalidate: 900`).
- **The scene** (`src/components/TideHero.tsx`) is pure SVG + CSS keyframes. Motion on an
  SVG `<g>` via a JS animation lib clobbers child transforms — keep animation in CSS and
  nest groups (static transform outer, animated inner). All keyframes live in
  `src/app/globals.css`, along with the five time-of-day palette blocks
  (`:root[data-theme="dawn|golden|dusk|night"]`).
- **Reduced motion** is a first-class path: every animation has a static fallback gated on
  `prefers-reduced-motion`. Preserve this when adding scene elements.
- **Licensing is load-bearing** (public deploy): only add assets that are CC0 / MIT /
  Apache / public-domain, and record them in the relevant `CREDITS.md`. Flag anything
  CC-BY (needs attribution) before shipping.

### Good next features (backlog)

1. **Per-beach indexable pages** (`/tides/<beach-slug>`) with SSG + sitemap + metadata —
   the real SEO unlock for "\<beach\> tide chart" searches (currently a single client-rendered route).
2. **Favorites / recent beaches** and **shareable beach links** (`/?beach=<stationId>`).
3. **Offline support** (service worker caching the last beach's 30-day window).
4. **Rip-current / beach-advisory / UV** overlays from NWS/state feeds.
