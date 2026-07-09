# Task State

## In Progress
- _None_ — everything live on tideandtumble.app; Google Search Console property verified + sitemap submitted 2026-07-09.

## Blocked
- _None_

## Next Up
1. Watch GSC indexing over the next 1-2 weeks (coverage + first "<beach> tide chart" impressions)
2. Icon-language unification: sun/moon rows + DayStrip to the hand-drawn set (last wow-pass slice)
3. Backlog: favorites/shareable ?beach= links, offline SW, NWS rip-current/advisory/UV overlays
4. Scale beyond curated 40 beaches once GSC shows the recipe ranking

## Notes
- GSC: Domain property sc-domain:tideandtumble.app, verified via apex TXT (google-site-verification=...BQvjiy0r5kg) added in Cloudflare zone. Do NOT delete that TXT record or verification is lost. Declined the Cloudflare-OAuth verify path (would grant Google standing DNS access) in favor of manual TXT.
- Vercel Git auto-deploy is unreliable on this project; deploy explicitly after merges (Vercel REST API from the homelab-macmini token in 1P Agent vault).
