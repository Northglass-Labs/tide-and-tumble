---
status: accepted
date: 2026-07-09
---
# ADR-001: Per-beach SSG pages with flat URLs, curated-first scope

## Context

The app was a single client-rendered route — Google indexed one generic page, so no
beach could rank for "\<beach\> tide chart" queries. A verified research pass
(incumbent teardown + Google docs) confirmed: incumbents rank via one static URL per
location with deep per-page content; CSR is a real indexing disadvantage; FAQPage/
Dataset schema no longer pay; there is no volume penalty for scale, but every page
must carry genuine location-specific data.

## Decision

Build server-rendered (SSG + ISR 1h) pages at flat `/tides/<beach-slug>` for the ~40
curated beaches plus 4 `/regions/<region-slug>` hubs, each meeting the researched
content-depth floor (7-day table with heights, sun/moon, nearby links, FAQ content,
NOAA provenance). BreadcrumbList is the only structured data. Expansion toward all
~3,500 NOAA stations is deferred until the curated recipe is proven.

## Consequences

- Beach pages become indexable and rankable; `/` keeps the interactive app.
- The interactive orchestrator moves from `app/page.tsx` into a reusable client
  component seeded per page — a one-time refactor.
- ISR keeps tables current without abandoning static generation.
- Slugs are permanent URL surface — stored explicitly, never regenerated.

## Alternatives considered

- **All ~3,500 NOAA stations now** — rejected for phase 1: depth-per-page is the
  ranking gate; prove the recipe on 40 first (no volume penalty later).
- **Nested `/tides/<region>/<beach>` URLs** — rejected: flat slugs carry the query
  keyword; region hubs supply the hierarchy for internal linking instead.
- **FAQPage/Dataset schema** — rejected: FAQ rich results removed (May 2026); Dataset
  only surfaces in Dataset Search.
- **Scraping local news per region** — rejected: copyright + per-site maintenance for
  thin relevance; NWS advisories (free, public domain) are the phase-2 enhancer.
