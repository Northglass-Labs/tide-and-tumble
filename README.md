# 🌊 Tide & Tumble

A beautiful, whimsical tide chart for **US beaches** — the Outer Banks, Cape Fear /
Wilmington, the Jersey Shore, and anywhere else on the coast. See at a glance
whether the tide is rolling **in** or slipping **out**, in a hand-tuned
[Tiny Wings](https://en.wikipedia.org/wiki/Tiny_Wings)-inspired beach scene full of
little surfers, sea turtles, fish, a whale, a sweeping lighthouse, and creatures
that swim and sway with the real tide.

[a Northglass Product](https://northglass.io) — a small tool, built well.

**Live:** https://tideandtumble.app

Built for opening on your phone at the beach — with a proper two-column dashboard
on desktop.

---

## What it does

- **Finds your beach automatically** — on first visit it locates the nearest tide
  station to you. You can also tap a curated beach (grouped by region), enter any
  US ZIP code, or drop a pin on the map — all resolve to the closest of ~3,500 NOAA
  stations nationwide.
- **Tide-direction at a glance** — a badge by the surfer shows **"Coming in"** with
  chevrons flowing shoreward on a rising tide, or **"Going out"** flowing seaward on
  the ebb. One fact per layer: the badge says the direction, the chips below say the
  numbers, and a single whimsical headline carries the personality.
- **Tiny Wings-style animated scene** — a multi-stop sky with a big soft sun, parallax
  dune silhouettes, water sparkles, and creatures with organic motion (birds glide and
  bank, fish dart with wiggling tails, jellyfish pulse, a whale glides deep at high
  tide, a lighthouse beacon sweeps and glows at dusk/night).
- **Whimsy & Easter eggs** — tap the surfer, whale, turtle, or beach ball for a pun in
  a speech bubble; tap the sun three times and it puts its sunglasses on 😎.
- **Live tide state** — a true beach perspective: sand at your feet, ocean to the
  horizon. The surf line slides down the frame on the flood (waves creep toward the
  sandcastle) and back toward the horizon on the ebb, exposing wide flats with tide
  pools and shells. The surfer rides the break wherever it goes; a whale cruises the
  deep at high tide; a dolphin leaps near the horizon. At night the surf glows with
  bioluminescence and the occasional shooting star crosses the star field.
- **Real numbers** — current height, rate of change, next high & next low with
  countdowns, and a 24-hour tide curve with a live "now" marker, day/night shading,
  and sun/moon markers at sunrise and sunset.
- **Any day, 30-day window** — a scrollable day strip, a native calendar picker, or
  swipe the hero to preview tides, curve, and conditions for any upcoming day. Full
  and new-moon days carry a spring-tide dot (the biggest tides). NWS beach advisories
  (rip current risk) stay visible on every day — full banner today, a compact
  "Today:" pill while previewing other days.
- **Live marine conditions** — ocean water temperature, wind (speed + direction), and
  surf/wave height with period, per beach.
- **Day → dawn → golden → dusk → night** palette that follows the sun for the selected
  beach and day.
- **Sun & moon** — sunrise/sunset, moonrise/moonset, and moon phase, computed on-device.
- **Optional beach-vibes ambient audio** — a fully procedural Web Audio soundscape with
  a quiet public-domain ocean-waves layer, muted by default behind a speaker toggle.

All motion respects `prefers-reduced-motion` (static fallbacks throughout).

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) |
| Fonts | Fredoka · Nunito · Pacifico (via `next/font`) |
| Animation | Pure SVG + CSS keyframes (GPU-friendly, reduced-motion aware) |
| Animated emoji | Google Noto (Apache-2.0) Lottie via `lottie-react` |
| Map | react-leaflet + OpenStreetMap (keyless) |
| Audio | Web Audio API (procedural) + a public-domain ocean loop |
| Hosting | Cloudflare Workers, free plan: the pages as static files, one Hono Worker for `/api/*` |

> ⚠️ **This is not the Next.js you may know.** Next 16 has breaking changes from older
> versions. See `AGENTS.md` — read the relevant guide in `node_modules/next/dist/docs/`
> before writing framework code.

---

## Develop

```bash
npm ci
npm run dev      # pages on http://localhost:3000 (the API is not served here)
npm run preview  # the whole site, API included, on http://localhost:4183
npm run verify   # types, lint, tests, the static export and its check
```

Node 26 (`.node-version`). No environment variables or secrets are needed —
every data source is free and keyless (see below). The pages are a static
export (`out/`); `src/worker/` is the API. Releasing, rolling back and the free
plan's limits are in **[docs/DELIVERY.md](./docs/DELIVERY.md)**; why it is built
this way is in [docs/specs/2026-11-27-workers-hosting.md](./docs/specs/2026-11-27-workers-hosting.md)
and [docs/adr/](./docs/adr/).

---

## Data sources (all free & keyless)

- **Tide predictions:** NOAA CO-OPS (`api.tidesandcurrents.noaa.gov`). Each beach maps
  to its nearest NOAA station; the smooth curve and current level are reconstructed
  from published high/low events with cosine interpolation (the "rule of twelfths"), so
  harmonic and subordinate stations render identically. One request pulls a ~32-day
  window so the day switcher is instant. Proxied by the API Worker, by station id,
  and cached per station for 15 minutes.
- **Marine conditions:** NDBC buoys (`realtime2`) for wave height/period/water temp, and
  NOAA CO-OPS for wind/water temp where a station has live sensors — each beach mapped to
  its nearest source with graceful per-field fallback. Asked by station id; the
  Worker looks up the coordinates.
- **Beach safety:** the National Weather Service's alerts and the Surf Zone
  Forecast's daily rip-current risk and UV index, through the API Worker. Never
  baked into a page.
- **Nearest station:** a bundled dataset of ~3,500 NOAA stations, with a haversine
  nearest-lookup that runs in your browser (the list loads only when you ask), so
  your location never leaves the device. 869 NDBC buoys are bundled in the Worker.
- **Sun/moon:** NOAA solar algorithm + a SunCalc-style lunar port, computed on-device.
- **ZIP → coordinates:** Zippopotam.us. **Map tiles:** OpenStreetMap.

Tide predictions courtesy of NOAA CO-OPS. **Not for navigation.**

---

## Project layout

```
src/
  app/
    page.tsx            # home: the interactive app + a crawlable beach directory
    tides/[slug]/       # static per-beach pages (/tides/nags-head): live chart,
      page.tsx          #   30-day forecast table, FAQ, breadcrumb JSON-LD
    regions/[slug]/     # static region hubs (/regions/outer-banks-nc)
      page.tsx
    sitemap.ts          # every beach + region URL
    robots.ts           # allow all → sitemap
    layout.tsx          # fonts + PWA metadata + metadataBase/title template
    manifest.ts         # web app manifest (Add to Home Screen)
    globals.css         # theme tokens + all keyframes (5 time-of-day palettes)
  worker/               # the API Worker (Hono), /api/* only
    index.ts            # guard: data only at the site's address, GET/HEAD, headers
    routes/             # tides, marine, alerts (all ?station=<id>), health
    lib/cache.ts        # answers cached per station in the Cache API
  lib/
    stations.ts         # curated beaches + region grouping + nearest lookup
    slugs.ts            # permanent per-beach URL slugs + region registry (SEO)
    seo.ts              # builders: 30-day table (also rebuilt in the browser), intro, FAQ
    nearest.ts          # nationwide nearest via the bundled NOAA list (in the browser)
    api-guard.ts        # station ids, per-client limits, station coordinates
    upstream.ts         # timeouts, size limits, no redirects for every upstream call
    alerts.ts           # NWS alerts + Surf Zone Forecast (rip risk, UV)
    tide-feed.ts        # shares the chart's predictions with the page's table
    tides.ts            # NOAA fetch, cosine interpolation, tide-state model
    marine.ts           # nationwide NDBC buoy + CO-OPS marine conditions
    sun.ts              # sunrise/sunset + moonrise/set + moon phase
    copy.ts             # whimsical, humorous microcopy per tide state
    noaa-stations.json  # ~3,500 NOAA stations (bundled)
    ndbc-stations.json  # 869 NDBC met buoys (bundled)
  components/
    TideApp.tsx         # the interactive orchestrator (seeds per-beach on SEO pages)
    TideHero.tsx        # the animated scene: rolling ocean, creatures, tide badge
    Surfer.tsx          # original hand-drawn surfer (carves/sprays with the tide)
    Gull.tsx            # original hand-drawn gliding gull
    Lighthouse.tsx      # original hand-drawn lighthouse (lives on the pier)
    StatIcon.tsx        # animated water/wind/surf icons (conditions card)
    TideCurve.tsx       # 24-hour tide curve with live "now" ripple marker
    DayStrip.tsx        # 30-day day switcher
    BeachPicker.tsx     # location / ZIP / list / map selector
    MapPicker.tsx       # react-leaflet map (client-only)
    AnimatedEmoji.tsx   # Noto Lottie loader (client-only)
    AmbientToggle.tsx   # procedural Web Audio + PD ocean layer
    WaterSparkles.tsx   # canvas water glints
    Sprite.tsx          # renders a downloaded sprite SVG inside the scene
    BeachTideTable.tsx  # the beach page's table, rebuilt in the browser for today
public/
  _headers              # security and cache headers for every static file
  sprites/              # Fluent Emoji (MIT) + Kenney (CC0) + original flat art
  emoji/                # Noto animated emoji Lottie JSON (Apache-2.0)
  audio/                # public-domain ocean-waves loop
```

See **[docs/DELIVERY.md](./docs/DELIVERY.md)** for the commands, the release and
rollback, and how contributions reach production. Operator accounts, DNS
configuration, credentials, and recovery procedures are intentionally kept outside
this public repository.

---

## Credits & licensing

Bundled assets are cleanly licensed:

- **Sprites:** Microsoft Fluent Emoji (MIT) and Kenney Fish Pack (CC0), plus original
  hand-drawn art authored for this project (the surfer, gull, lighthouse, and UI
  icons are original inline SVG). See `public/sprites/CREDITS.md`.
- **Animated emoji:** Google Noto Emoji (Apache-2.0). See `public/emoji/`.
- **Audio:** a public-domain ocean-waves excerpt ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Waves.ogg)),
  layered under a fully procedural Web Audio soundscape. See `public/audio/CREDITS.md`.
- **Data:** tides from NOAA CO-OPS, marine conditions from NDBC, beach advisories and
  UV from the National Weather Service — all US public-domain. **Not for navigation.**

The Tide & Tumble source code and original artwork are **© Northglass LLC, all rights
reserved** (see [LICENSE](./LICENSE)); bundled third-party assets keep their own
licenses above.

## Privacy & contact

No accounts, no cookies, no tracking, no analytics — see the [privacy policy](https://tideandtumble.app/privacy).
Questions: **hello@northglass.io**.
