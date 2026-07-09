# SEO Beach Pages — Design

**Date:** 2026-07-09 · **Status:** approved (Tom, in-session)
**Goal:** rank for "\<beach\> tide chart / tides / tide times" by giving every curated
beach an indexable, content-deep, server-rendered page. Strategy validated by a
deep-research pass over incumbent tide sites + Google docs (details: session notes;
key findings inline below).

## Scope (phase 1 — this build)

- ~40 curated beaches (`src/lib/stations.ts`) → `/tides/<beach-slug>`
- 4 region hubs → `/regions/<region-slug>`
- `sitemap.ts`, `robots.ts`, BreadcrumbList JSON-LD, canonical + OG on every page
- Home (`/`) unchanged: the interactive app
- **Out of scope (later phases):** all ~3,500 NOAA stations (expand only after the
  curated recipe is proven; no volume penalty per research, but depth-per-page is the
  gate), NWS advisories/weather modules (backlog #4), local-news scraping (rejected —
  licensing + maintenance, thin relevance).

## Evidence-backed requirements (from research)

1. Static per-location URL, keyword in slug (all incumbents do this).
2. Depth floor per page: multi-day tide table **with heights**, sun/moon,
   location-named FAQ, NOAA source/datum note (~500+ words of real content).
   Thin "times only" pages don't compete.
3. Title `≈ <Beach>, <ST> Tide Chart — Today's High & Low Tide Times | Tide & Tumble`;
   H1 `≈ Tides Today & Tomorrow in <Beach>, <ST>`.
4. Hub-and-spoke internal links: region hubs + per-page "Tides near <Beach>" block
   (~8 nearest, with distances).
5. SSG/ISR over CSR (Google explicitly recommends pre-rendering; metadata + content
   must be in initial HTML).
6. Structured data: **BreadcrumbList only** (FAQPage rich results removed May 2026;
   Dataset is Dataset-Search-only). FAQ stays as *content*, no FAQPage schema needed.
7. Freshness: ISR `revalidate: 3600` so tables read "today" like incumbents.

## URL & slug scheme

- Flat: `/tides/nags-head`, `/tides/wrightsville-beach`, `/tides/ocean-city-nj`.
- Slugs derived from `label`, lowercased/hyphenated, with state suffix only where the
  label needs disambiguation (Ocean City NJ/MD) — stored explicitly per station in a
  new `slug` field so they are stable forever (slugs are URLs; never regenerate).
- Regions: `/regions/outer-banks-nc`, `/regions/cape-fear-wilmington-nc`,
  `/regions/jersey-shore-nj`, `/regions/east-coast-beaches`.

## Page anatomy — `/tides/<slug>` (server component, ISR 1h)

1. Header + breadcrumb (Home › Region › Beach) + BreadcrumbList JSON-LD.
2. H1 + "today" line (dates rendered server-side at revalidate time).
3. Interactive scene: the existing client app seeded to this beach
   (`<TideApp initialStation={…} seeded>`), localStorage/geolocation overrides
   disabled when seeded so the page always shows *its* beach.
4. **7-day tide table** (server-rendered `<table>`): per day, high/low times with
   heights (ft) + sunrise/sunset + moonrise/set + phase. Data from the same NOAA
   fetch + cosine model in `lib/tides.ts`, run server-side.
5. Marine conditions snapshot (water temp / wind / surf where available).
6. ~120-word location-specific intro generated from real fields (region, exposure,
   station name/type, coords) — template with per-beach data, not boilerplate.
7. "Tides near \<Beach\>" — 8 nearest curated beaches by haversine, with miles.
8. FAQ (content only): high tide today (from data), tide direction now, station
   provenance, spring/neap note from moon phase.
9. NOAA attribution + **"Predictions are NOAA CO-OPS; not for navigation."**

## Region hub — `/regions/<slug>`

H1 `<Region> Tide Charts`, short intro, card grid linking each beach (label, station,
exposure), breadcrumb + JSON-LD. Statically generated, ISR daily.

## Architecture changes

- `src/lib/slugs.ts` — NEW: `slug` + `state` per station (explicit map), region slug
  registry, `beachBySlug()`, `nearestBeaches(station, n)`.
- `src/app/page.tsx` → thin server wrapper; interactive body extracted to
  `src/components/TideApp.tsx` (`"use client"`, props: `initialStation?`,
  `seeded?: boolean`). Behavior on `/` identical to today.
- `src/lib/tides.ts` — expose the NOAA fetch for server use (it already runs in the
  API route; reuse, don't duplicate).
- `src/app/tides/[slug]/page.tsx` — `generateStaticParams` (all slugs),
  `generateMetadata` (title/desc/canonical/OG), `revalidate = 3600`.
- `src/app/regions/[slug]/page.tsx` — same pattern, `revalidate = 86400`.
- `src/app/sitemap.ts` + `src/app/robots.ts` — all URLs, absolute, on
  `https://tideandtumble.app` (set `metadataBase`).
- Root layout: `metadataBase`, default OG, title template
  (`%s | Tide & Tumble`).

## Constraints honored

- Animated scene stays pure SVG + CSS keyframes; no JS animation libs; reduced-motion
  fallbacks unchanged (we only *embed* the existing component).
- No new assets → no CREDITS.md changes.
- `npm run build` green before deploy; ship via feature branch → PR → preview.

## Error handling

- NOAA fetch failure at ISR time: page still renders (station metadata, intro, FAQ,
  links) with a "live table temporarily unavailable" note — never a 500; stale ISR
  copy continues serving.
- Unknown slug → `notFound()` (404).

## Testing

- `npm run build` (typecheck + SSG of all ~45 routes).
- Script check: every station has unique slug; sitemap URL count matches.
- Manual: curl a beach page → title/H1/table present in raw HTML (no JS).

## Success criteria

Raw HTML of `/tides/nags-head` contains: unique title/meta/canonical, H1 with beach
name, a 7-day table with real heights, nearby links, FAQ text, breadcrumb JSON-LD —
and Search Console can be pointed at `sitemap.xml` after merge.
