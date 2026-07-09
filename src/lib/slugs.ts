// SEO slug registry for curated beaches + regions.
//
// Slugs are PERMANENT public URLs (/tides/<slug>) — they are declared explicitly
// here, never derived at runtime, so a label tweak can't silently move a page.
// If you add a beach to stations.ts, add its slug (and state) here; the build
// fails loudly if a curated beach is missing a slug (see assertion at bottom).

import { STATIONS, distanceMiles, type Station } from "./stations";

/** stationId (curated id, incl. "-suffix" ids) → permanent URL slug */
const SLUG_BY_ID: Record<string, string> = {
  // Outer Banks, NC
  "8651370": "corolla",
  "8651370-duck": "duck",
  "8651605": "kitty-hawk",
  "8651605-kdh": "kill-devil-hills",
  "8652226": "nags-head",
  "8652587": "oregon-inlet",
  "8653215": "rodanthe",
  "8654400": "avon",
  "8654400-buxton": "buxton",
  "8654467": "hatteras",
  "8654769": "ocracoke",
  // Cape Fear · Wilmington, NC
  "8657419": "topsail-beach",
  "8658163": "wrightsville-beach",
  "8658559": "carolina-beach",
  "8658559-kure": "kure-beach",
  "8658741": "fort-fisher",
  "8658901": "bald-head-island",
  "8659084": "southport",
  "8658120": "wilmington",
  // Jersey Shore, NJ
  "8531680": "sandy-hook",
  "8532337": "belmar",
  "8532591": "point-pleasant",
  "8533615": "barnegat",
  "8533615-lbi": "long-beach-island",
  "8534720": "atlantic-city",
  "8534770": "ocean-city-nj",
  "8535835": "wildwood",
  "8535962": "cape-may",
  // More US beaches
  "8447435": "cape-cod-chatham",
  "8510560": "montauk",
  "8512354": "the-hamptons",
  "8516881": "rockaway-beach",
  "8516385": "jones-beach",
  "8557863": "rehoboth-beach",
  "8570280": "ocean-city-md",
  "8639168": "virginia-beach",
  "8661070": "myrtle-beach",
  "8665530": "charleston-folly",
  "8670892": "tybee-island",
};

/** stationId → two-letter state (regions imply NC/NJ; "More" varies). */
const STATE_BY_ID: Record<string, string> = {
  "8447435": "MA",
  "8510560": "NY",
  "8512354": "NY",
  "8516881": "NY",
  "8516385": "NY",
  "8557863": "DE",
  "8570280": "MD",
  "8639168": "VA",
  "8661070": "SC",
  "8665530": "SC",
  "8670892": "GA",
};

export interface Region {
  slug: string;
  /** must match Station.region in stations.ts exactly */
  region: string;
  /** display title for the hub page H1: "<title> Tide Charts" */
  title: string;
  blurb: string;
}

export const REGIONS: Region[] = [
  {
    slug: "outer-banks-nc",
    region: "Outer Banks, NC",
    title: "Outer Banks, NC",
    blurb:
      "Tide charts for the OBX barrier islands, from Corolla and Duck down through Nags Head, Hatteras, and Ocracoke — ocean piers, inlets, and the Pamlico Sound side.",
  },
  {
    slug: "cape-fear-wilmington-nc",
    region: "Cape Fear · Wilmington, NC",
    title: "Cape Fear & Wilmington, NC",
    blurb:
      "Tides for the Cape Fear coast: Topsail, Wrightsville, Carolina and Kure Beach on the ocean, plus the Cape Fear River from Fort Fisher up to downtown Wilmington.",
  },
  {
    slug: "jersey-shore-nj",
    region: "Jersey Shore, NJ",
    title: "Jersey Shore, NJ",
    blurb:
      "Jersey Shore tide charts from Sandy Hook to Cape May — boardwalk beaches, inlets, and every stretch of sand in between.",
  },
  {
    slug: "east-coast-beaches",
    region: "More US beaches",
    title: "More East Coast Beaches",
    blurb:
      "A sweep of favorite Atlantic beaches beyond our core regions — Cape Cod to Tybee Island, including Montauk, Rehoboth, Ocean City MD, Virginia Beach, and Myrtle Beach.",
  },
];

export interface Beach extends Station {
  slug: string;
  state: string;
}

function stateFor(s: Station): string {
  if (STATE_BY_ID[s.id]) return STATE_BY_ID[s.id];
  if (s.region.endsWith("NC")) return "NC";
  if (s.region.endsWith("NJ")) return "NJ";
  return "US";
}

/** All curated beaches with their permanent slugs + states. */
export const BEACHES: Beach[] = STATIONS.map((s) => ({
  ...s,
  slug: SLUG_BY_ID[s.id] ?? "",
  state: stateFor(s),
}));

// Fail the build loudly if a curated beach is missing a slug or slugs collide.
{
  const seen = new Set<string>();
  for (const b of BEACHES) {
    if (!b.slug) throw new Error(`slugs.ts: no slug for station ${b.id} (${b.label})`);
    if (seen.has(b.slug)) throw new Error(`slugs.ts: duplicate slug "${b.slug}"`);
    seen.add(b.slug);
  }
}

export function beachBySlug(slug: string): Beach | undefined {
  return BEACHES.find((b) => b.slug === slug);
}

export function regionBySlug(slug: string): Region | undefined {
  return REGIONS.find((r) => r.slug === slug);
}

export function regionOf(beach: Beach): Region {
  return REGIONS.find((r) => r.region === beach.region) ?? REGIONS[REGIONS.length - 1];
}

export function beachesInRegion(region: Region): Beach[] {
  return BEACHES.filter((b) => b.region === region.region);
}

/** The n nearest other curated beaches, with distance in miles. */
export function nearbyBeaches(
  beach: Beach,
  n = 8,
): { beach: Beach; miles: number }[] {
  return BEACHES.filter((b) => b.slug !== beach.slug)
    .map((b) => ({ beach: b, miles: distanceMiles(beach.lat, beach.lng, b.lat, b.lng) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, n);
}

export const SITE_URL = "https://tideandtumble.app";
