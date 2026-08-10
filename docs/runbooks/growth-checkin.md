# Growth check-in (biweekly)

Run when Tom says "run the growth check-in" (a biweekly calendar event nudges
him). Goal: is Tide & Tumble growing organically in search, and is anything
blocking it? Keep the whole thing under ~10 minutes; end with a short verdict
against the thresholds below.

Baseline for context: domain + GSC property live since **2026-07-09**
(45 sitemap URLs: 39 beaches + 4 regions + home + privacy).

## 1. Automated checks (Claude runs these)

- **Health:** `https://tideandtumble.app`, a beach page, and
  `/api/tides?station=8651370` all answer (Kuma watches these continuously —
  this is just a spot confirmation). Check no beach page is serving the
  "tide table temporarily unavailable" ISR fallback while NOAA is up.
- **Indexing proxy:** WebSearch `site:tideandtumble.app` — roughly how many
  pages surface?
- **Rank probes:** WebSearch a sample of target queries and note whether
  tideandtumble.app appears (and roughly where):
  - `corolla tide chart` (home beach)
  - `nags head tide chart` (competitive OBX)
  - `wrightsville beach tide chart` (Cape Fear region)
  - `sandy hook tide times` (Jersey Shore)
  - one long-tail: `kill devil hills low tide today`
- **Sitemap:** `curl -s https://tideandtumble.app/sitemap.xml | grep -c "<loc>"`
  → expect 45 (more after any beach expansion).
- Log the results as a dated row in `docs/growth-log.md` (create on first run:
  date · indexed-proxy · probes hit/miss · notes).

## 2. Manual GSC glance (Tom, ~2 min — Claude reminds, can't API this yet)

search.google.com/search-console → property `tideandtumble.app`:
- **Pages:** indexed count; anything in "Crawled – not indexed"?
- **Performance:** impressions trend (leading indicator); top queries; any
  page's average position on its "<beach> tide chart" term.
- **Core Web Vitals:** still green?

Tom reports the numbers back; Claude appends them to the growth-log row.

## 3. Verdict against thresholds

| When (from 2026-07-09) | Signal | If missed → action |
|---|---|---|
| ~4 weeks (early Aug) | Most pages indexed; "Discovered – not indexed" shrinking | Strengthen internal links; pursue 2–3 legit backlinks (OBX community/tourism resources) |
| ~8 weeks (early Sep) | Impressions clearly nonzero and trending up | Audit canonicals/indexing; investigate structurally |
| ~3 months (mid Oct) | Any beach page top-20 for its "<beach> tide chart" query | **Recipe proven → scale past the 40 curated beaches**, expanding regions the queries report says are surfacing |

Growth levers if things look good: add beaches (each = new long-tail surface),
regional expansion guided by the GSC queries report. Levers if slow: internal
linking, a few genuine backlinks, patience — new domains are typically
rank-suppressed for their first months regardless of quality.
