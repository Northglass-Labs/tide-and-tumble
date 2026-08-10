@AGENTS.md

# Tide & Tumble — public repository orientation

Tide & Tumble is a whimsical US tide-chart application built with Next.js 16,
React 19, and Tailwind CSS v4. It has no accounts or database; runtime data comes
from the keyless public services documented in the README.

## Start here

- `README.md` — product behavior, stack, sources, layout, and local development.
- `DEPLOYMENT.md` — public contribution and release gates.
- `node_modules/next/dist/docs/` — the installed Next.js 16 documentation. Read the
  relevant guide before changing framework behavior.

## Engineering conventions

- The animated scene in `src/components/TideHero.tsx` is SVG plus CSS keyframes.
  Do not drive SVG group transforms with a JavaScript animation library; nest a
  static outer group and animated inner group.
- Every animation requires a `prefers-reduced-motion` static fallback.
- Keep one voice per status layer: the scene badge names direction, chips show
  numbers, and one headline carries personality.
- Theme styling belongs in CSS custom properties; keep SVG/JSX markup identical
  across palettes and use `bg-surface` for readable UI tint surfaces.
- Only add CC0, MIT, Apache, or public-domain assets and update the relevant
  `public/**/CREDITS.md`.
- Preserve NOAA/NWS/NDBC attribution and the “not for navigation” warning.

## Public identity and operations boundary

- Public contact: `hello@northglass.io`.
- Never commit personal email, personal identity details, private paths, provider
  account identifiers, credentials, DNS administration, incident notes, or recovery
  procedures.
- Private operations records are authoritative for deployment and infrastructure.
  Do not recreate them in this repository.
- `npm test`, `npm run lint`, and `npm run build` must pass before release.
