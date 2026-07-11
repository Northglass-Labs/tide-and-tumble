# ADR-004: Beach-perspective scene model (static ocean, moving sand apron)

- **Status:** accepted
- **Date:** 2026-07-10

## Context

The original hero scene was an aquarium cross-section fused with a landscape:
a water "tank" whose level rose and fell (the whole water group translated),
fish rendered inside the water body, coral/seaweed on a "seabed," and a
sandcastle that was underwater at high tide. User feedback: "water, then sand,
then more water — it doesn't make sense." Anything static drawn in front of
the moving water either floated on it or drowned under it, which constrained
every scene addition (the lighthouse pier needed occlusion hacks to work).

## Decision

The scene is a true beach perspective — sky → horizon (`HORIZON = 148`) →
**static ocean** (horizon to frame bottom) → **moving sand apron** → permanently
dry foreground. The tide moves the **surf line**: the sand apron translates
over the ocean (`shoreY = SHORE_LOW 216 → SHORE_HIGH 300`, CSS-tweened), so
flood pushes the waterline toward the viewer and ebb exposes flats.

## Consequences

- Shore-bound elements (surf foam, wet-sand edge, tide pools, shells, the
  surfer) attach to the sand apron and ride the tide for free; things placed
  low in apron-local coords auto-hide below the frame at high tide.
- Ocean creatures live in the always-water zone (y ≈ 155–210, below the
  horizon) and can never be beached; structures in the water (pier) render
  between ocean and apron so the sand buries their feet at low tide.
- The foreground strip (y ≈ 300–340) is permanently dry — safe for the
  sandcastle, palm, beach ball, and reduced-motion critter fallbacks.
- Screenshot testing: drive the apron's inline `translateY` directly
  (216 = dead low, 300 = king tide); the service worker makes route-mocking
  unreliable (re-registers with `clients.claim()` every load).
- Harder: mid-water set pieces that must track the waterline but not the sand
  (none exist today) would need their own translate group.

## Alternatives considered

- **Keep the tank model, patch per-element** — rejected: every new element
  needed a bespoke occlusion hack; the composition still read as nonsense.
- **Move the water's top edge only (dynamic path/clip)** — rejected: SVG path
  `d` and clip geometry can't be CSS-transitioned; translate groups can.
- **Full parallax/3D perspective (scaled sprites by depth)** — rejected:
  overkill for a whimsical flat style; the layered swell rows already sell
  depth cheaply.
