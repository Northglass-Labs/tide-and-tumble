# ADR-003: One voice per layer for tide-status messaging

- **Status:** accepted
- **Date:** 2026-07-09

## Context

User feedback: the status area felt cluttered — four stacked elements restated
the same tide fact (scene badge "Going out · 0.7 ft/hr", whimsical headline,
"↓ Falling / 1.1 ft / −0.7 ft/hr" chips, and a shelling-hint line whose copy
near-duplicated the headline pool). Deep research (103-agent verified sweep)
converged: Carrot Weather — the canonical personality-forward condition app —
architects personality and data as two separable layers and compresses
personality to one line under glanceability pressure; NN/g classifies
same-fact repetition across adjacent elements as noise (vs icon+text within
one element, which is reinforcement); Stanford's Clippy post-mortems show
uninvited persistent character speech is what annoys, not characters;
accessibility testing rates in-SVG informational text "Not Recommended"
across screen readers.

## Decision

Each tide fact is stated exactly once, in a designated layer:

| Layer | Owns | Never carries |
|---|---|---|
| Scene badge | Direction word (+ slack's "about to turn") | Numbers, whimsy |
| Headline | ALL whimsy + activity flavor, ONE line (rotating pool in `lib/copy.ts`) | A second line |
| Chips | Numbers (height, rate) | Direction words, prose |
| Scene creatures | Tap-invited quips only (contextual pools, e.g. surfer low-tide shelling lines) | Persistent/unprompted text |
| SVG scene | `role="img"` + status-bearing `aria-label` | In-SVG `<text>` informational copy |

## Consequences

- Easier: adding new whimsy = add lines to the headline pool or creature quip
  pools; no new UI surface needed.
- Easier: glanceability — one read per zone.
- Harder: activity guidance (shelling, surf) must be woven into headline-pool
  variants per tide state instead of bolted on as extra lines.
- Guard: any future "helpful extra line" under the headline is a regression of
  this decision — put it in the headline pool or behind a tap.

## Alternatives considered

- **Persistent headline as a speech bubble on the surfer** — rejected: uninvited
  persistent character speech is the documented Clippy failure mode, and in-SVG
  text breaks NVDA/mobile screen readers.
- **Keep hint line, delete headline** — rejected: the headline is the product's
  voice; the hint was the duplicate.
- **Remove the scene badge entirely (strict Carrot)** — rejected: the badge is
  the fastest glance cue on the page; slimmed to the direction word instead.
- **User-configurable personality dial (Carrot-style)** — deferred: right-sized
  for a paid weather app, overkill for a free tide chart today.
