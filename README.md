# 🌊 Tide & Tumble

A beautiful, whimsical tide chart for **US beaches** — the Outer Banks, Cape Fear /
Wilmington, the Jersey Shore, and anywhere else on the coast. See at a glance
whether the tide is rolling **in** or slipping **out**, in a hand-tuned
[Tiny Wings](https://en.wikipedia.org/wiki/Tiny_Wings)-inspired beach scene full of
little surfers, sea turtles, fish, a whale, a sweeping lighthouse, and creatures
that swim and sway with the real tide.

**Live:** https://tideandtumble.app · (`obx-tides.vercel.app` 308-redirects here)

Built for opening on your phone at the beach.

---

## What it does

- **Finds your beach automatically** — on first visit it locates the nearest tide
  station to you. You can also tap a curated beach (grouped by region), enter any
  US ZIP code, or drop a pin on the map — all resolve to the closest of ~3,500 NOAA
  stations nationwide.
- **Tide-direction at a glance** — a badge by the surfer shows **"Coming in"** with
  chevrons flowing shoreward on a rising tide, or **"Going out"** flowing seaward on
  the ebb, plus the live rate (ft/hr). No day-switching required to feel the trend.
- **Tiny Wings-style animated scene** — a multi-stop sky with a big soft sun, parallax
  dune silhouettes, water sparkles, and creatures with organic motion (birds glide and
  bank, fish dart with wiggling tails, jellyfish pulse, a whale glides deep at high
  tide, a lighthouse beacon sweeps and glows at dusk/night).
- **Whimsy & Easter eggs** — tap the surfer, whale, turtle, or beach ball for a pun in
  a speech bubble; tap the sun three times and it puts its sunglasses on 😎.
- **Live tide state** — a hero "water tank" fills to the current tide level; creatures
  swim toward shore on a rising tide and drift seaward on the ebb. Crabs and sea stars
  appear on the exposed sand at low tide; a dolphin leaps as the flood nears high.
- **Real numbers** — current height, rate of change, next high & next low with
  countdowns, and a 24-hour tide curve with a live "now" marker.
- **Any day, 30-day window** — a scrollable day strip (or swipe the hero) to preview
  tides, curve, and conditions for any upcoming day.
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
| Hosting | Vercel |

> ⚠️ **This is not the Next.js you may know.** Next 16 has breaking changes from older
> versions. See `AGENTS.md` — read the relevant guide in `node_modules/next/dist/docs/`
> before writing framework code.

---

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (must pass before deploy)
npm run start    # serve the production build locally
npm run lint     # eslint
```

Node 20+ recommended. No environment variables are required — every data source is
free and keyless (see below).

---

## Data sources (all free & keyless)

- **Tide predictions:** NOAA CO-OPS (`api.tidesandcurrents.noaa.gov`). Each beach maps
  to its nearest NOAA station; the smooth curve and current level are reconstructed
  from published high/low events with cosine interpolation (the "rule of twelfths"), so
  harmonic and subordinate stations render identically. One request pulls a ~32-day
  window so the day switcher is instant. Proxied server-side and cached 15 min.
- **Marine conditions:** NDBC buoys (`realtime2`) for wave height/period/water temp, and
  NOAA CO-OPS for wind/water temp where a station has live sensors — each beach mapped to
  its nearest source with graceful per-field fallback.
- **Nearest station:** a bundled dataset of ~3,500 NOAA stations + 869 NDBC buoys, with
  haversine nearest-lookup (server-only).
- **Sun/moon:** NOAA solar algorithm + a SunCalc-style lunar port, computed on-device.
- **ZIP → coordinates:** Zippopotam.us. **Map tiles:** OpenStreetMap.

Tide predictions courtesy of NOAA CO-OPS. **Not for navigation.**

---

## Project layout

```
src/
  app/
    page.tsx            # home: the interactive app + a crawlable beach directory
    tides/[slug]/       # SSG per-beach pages (/tides/nags-head): tide chart,
      page.tsx          #   30-day forecast table, marine, FAQ, breadcrumb JSON-LD
    regions/[slug]/     # SSG region hubs (/regions/outer-banks-nc)
      page.tsx
    sitemap.ts          # every beach + region URL
    robots.ts           # allow all → sitemap
    layout.tsx          # fonts + PWA metadata + metadataBase/title template
    manifest.ts         # web app manifest (Add to Home Screen)
    globals.css         # theme tokens + all keyframes (5 time-of-day palettes)
    api/
      tides/route.ts    # NOAA CO-OPS proxy (any station id), cached 15 min
      nearest/route.ts  # ?lat=&lng= → nearest station + nearby list
      marine/route.ts   # ?station=&lat=&lng= → water temp / wind / surf
  lib/
    stations.ts         # curated beaches + region grouping + nearest lookup
    slugs.ts            # permanent per-beach URL slugs + region registry (SEO)
    seo.ts              # server-side builders: 7/30-day table, intro, FAQ copy
    nearest.ts          # nationwide nearest via bundled NOAA dataset
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
    StatIcon.tsx        # animated water/wind/surf icons (conditions card)
    TideCurve.tsx       # 24-hour tide curve with live "now" ripple marker
    DayStrip.tsx        # 30-day day switcher
    BeachPicker.tsx     # location / ZIP / list / map selector
    MapPicker.tsx       # react-leaflet map (client-only)
    AnimatedEmoji.tsx   # Noto Lottie loader (client-only)
    AmbientToggle.tsx   # procedural Web Audio + PD ocean layer
    WaterSparkles.tsx   # canvas water glints
    Sprite.tsx          # renders a downloaded sprite SVG inside the scene
public/
  sprites/              # Fluent Emoji (MIT) + Kenney (CC0) + original flat art
  emoji/                # Noto animated emoji Lottie JSON (Apache-2.0)
  audio/                # public-domain ocean-waves loop
```

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for how this is hosted, the custom-domain/DNS
setup, and the exact steps to ship a change.

---

## Credits & licensing

All shipped assets are cleanly licensed for a public deploy:

- **Sprites:** Microsoft Fluent Emoji (MIT) and Kenney Fish Pack (CC0), plus original
  flat art authored for this project. See `public/sprites/CREDITS.md`.
- **Animated emoji:** Google Noto Emoji (Apache-2.0). See `public/emoji/`.
- **Audio:** a public-domain ocean-waves excerpt ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Waves.ogg)),
  layered under a fully procedural Web Audio soundscape. See `public/audio/CREDITS.md`.
