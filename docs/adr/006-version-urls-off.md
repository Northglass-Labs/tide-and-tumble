---
status: accepted
date: 2026-11-27
---

# ADR-006: Version URLs off; a release is checked in production

## Context

With Version URLs on (`preview_urls` in `wrangler.jsonc`), every Worker version
Wrangler uploads answers at an address of its own on the account's
`workers.dev` subdomain for as long as Cloudflare keeps it. The app template
uses them to check a new version before it takes traffic.

Two things weigh against them here:

- An old version stays callable at its address. A review of the app template
  (2026-11-27) found that this keeps every superseded version reachable, and
  Sitdown turned them off for that reason (its ADR-008, in review). The
  template will take the same default.
- This repository is public, and so are its Actions logs. A Version URL carries
  the account's `workers.dev` subdomain, which is an account identifier that
  the public boundary (ADR-007) keeps out of this repository; a release from
  GitHub would print one.

## Decision

- `wrangler.jsonc` sets `"preview_urls": false`, written out: left out, Wrangler
  keeps whatever Cloudflare has.
- `promote` uploads a version, reads production again, sends the new version
  all traffic, then checks production. A failed check is repeated once; if it
  fails again, `promote` rolls back to the version that was live before, but
  only while its own version is still the live one.
- If Wrangler names a version address anyway, Version URLs are on in
  Cloudflare: `promote` stops before traffic moves and says so.
- Production is checked at `https://tideandtumble.app` only after `promote`
  has confirmed the address is served by this Worker (it answers with the live
  version). Otherwise it refuses, and the operator names the Worker's own
  `workers.dev` address with `--origin`, which is never written into the
  repository. `rollback` checks at the same address.

## Trade-offs

- **A bad build serves production until its check fails and the rollback
  lands:** up to about three minutes in the worst case (a check retries for up
  to 90 seconds while a release spreads, then runs once more). Before, such a
  version failed at its own address and never took traffic. Wrangler still
  refuses a Worker that does not start, and `promote` refuses a build that does
  not export.
- The pages are static and the API has no state, so the version before is
  always a working rollback target.

## Consequences

- `test/scripts/release.test.ts` holds the flow: no check at a version
  address, the stop when one is named, the confirmation of the address, the
  repeat and the rollback. `test/scripts/project.test.ts` holds
  `wrangler.jsonc` to `false`.
- Before the cutover, releases are made from a workstation with `--origin`
  set to the Worker's `workers.dev` address; GitHub releases nothing until the
  operator adds the release secret, after the cutover.
