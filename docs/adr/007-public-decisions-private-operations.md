---
status: accepted
date: 2026-11-27
---

# ADR-007: Decisions in public, operations in private

## Context

On 2026-08-10 this repository was cleaned before it became the public home of
a Northglass product. Its decision records and runbooks named the project's
pre-Northglass origin and provider accounts, so `docs/adr/` and
`docs/runbooks/` were removed (kept privately), and `tests/opsec.test.ts`
guarded the boundary by refusing those two directories.

Every Northglass app built from the app template keeps its standing decisions
in `docs/adr/` and its delivery contract in `docs/DELIVERY.md`, and keeps
hosting facts (accounts, DNS, routes, monitoring) in the private operations
record. Moving to Workers adds decisions worth recording here.

## Decision

- Engineering decisions are public: `docs/adr/` returns, with records written
  for a public reader. Numbering continues after the four private records.
- Operations stay private, as before: account, zone, route and record
  identifiers, the `workers.dev` subdomain, credentials and where they are
  kept, DNS administration, the cutover and hosting-rollback steps, incident
  notes and monitoring configuration.
- `tests/opsec.test.ts` guards content instead of directory names: every
  tracked text file outside the code (documents, workflows, configuration) is
  scanned for the patterns that would carry those details: Cloudflare and
  Vercel identifiers, the `workers.dev` subdomain, nameservers, bearer
  tokens, credential stores, private paths and any email address other than
  `hello@northglass.io` and the GitHub noreply addresses.

## Trade-offs

- A content scan can miss a detail written in a form it does not know. The
  directory rule could not, but it also kept every decision out of public
  view, including ones a contributor needs.
- `docs/DELIVERY.md` describes the cutover and the hosting rollback only in
  general terms; the operator's exact steps are private.

## Consequences

- The release scripts scrub email addresses, account ids and the
  `workers.dev` subdomain from anything they print, since Actions logs of a
  public repository are public (ADR-006).
- A new decision gets a record here; a new hosting fact goes to the private
  record.
