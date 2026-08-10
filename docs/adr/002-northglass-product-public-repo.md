---
status: accepted
date: 2026-07-09
---
# ADR-002: Tide & Tumble becomes a public Northglass Labs product

## Context

Tide & Tumble started as a personal side project under `tomstetson/`. It has grown
into a genuinely useful, polished free app (live at tideandtumble.app, SEO pages,
original art, NWS safety advisories). The owner wants it to be a Northglass Labs
product: moved to the `Northglass-Labs` GitHub org, made public, listed on
northglass.io, with a proper privacy policy and public contact identity — matching
how Idle, Sitdown, and Bean are handled.

Going public exposes all git history, so the repo must satisfy the Northglass Public
Identity Rule (no personal email in any artifact).

## Decision

- Move the repo to `github.com/Northglass-Labs/tide-and-tumble` and set it **public**.
- Public identity: contact is **hello@northglass.io**; git authorship stays the
  GitHub noreply (`tomstetson@users.noreply.github.com`). No personal Gmail appears
  anywhere (verified: history + files clean).
- **License: all rights reserved, © Northglass LLC** (`LICENSE`, package.json
  `UNLICENSED`) — matching the house default and the northglass.io site itself.
  Public for transparency, not open-source. Bundled third-party assets (Fluent MIT,
  Kenney CC0, Noto Apache) keep their own licenses.
- Add a `/privacy` page that sits under the parent `northglass.io/privacy` policy and
  a site-wide footer (Privacy · Contact · Source).
- List it on northglass.io as a "Tool" (`src/lib/constants.ts` `TOOLS` array) with
  `demo: https://tideandtumble.app`, `sourcePublic: true`.
- Hosting facts move to `HomeLab/hosting/tide-and-tumble.md` (house convention:
  hosting docs live in the homelab, not the product repo); the internal
  `HOMELAB_HANDOFF.md` was removed from the repo and archived in the homelab.

## Consequences

- The app gains a real product identity, a link from northglass.io, and an honest
  privacy policy — table stakes for a public tool.
- All-rights-reserved keeps IP with Northglass while still being source-available;
  can be relaxed to MIT later with a superseding ADR if a truly open-source posture
  is wanted.
- The Vercel project (`obx-tides`, still under the personal Vercel scope) now builds
  from an org-owned repo; the Vercel GitHub app must have `Northglass-Labs` access
  for Git deploys (explicit API deploys work regardless).

## Alternatives considered

- **MIT license** — rejected as the default: the owner said "public," not
  "open-source," and the house posture is all-rights-reserved until a repo is
  deliberately opened. Easy to switch later.
- **Fresh repo in the org (no transfer)** — rejected: loses history/issues and the
  existing Vercel Git link; a transfer preserves both and redirects the old URL.
- **Keep hosting docs in the repo** — rejected: house convention keeps them in the
  homelab (`hosting/<project>.md`) so public repos carry no infra detail.
