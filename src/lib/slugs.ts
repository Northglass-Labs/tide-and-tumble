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
  // New England
  "8413320": "bar-harbor",
  "8418150": "portland-me",
  "8418557": "old-orchard-beach",
  "8429489": "hampton-beach",
  "8446121": "provincetown",
  "8449130": "nantucket",
  "8448558": "marthas-vineyard",
  "8452660": "newport-ri",
  "8454658": "narragansett",
  "8459338": "block-island",
  // Florida · Atlantic Coast
  "8720587": "st-augustine-beach",
  "8721120": "daytona-beach",
  "8721164": "new-smyrna-beach",
  "8721604": "cocoa-beach",
  "8722956": "fort-lauderdale",
  "8723080": "miami-beach",
  "8724580": "key-west",
  // Florida · Gulf Coast
  "8729807": "pensacola-beach",
  "8729511": "destin",
  "8729210": "panama-city-beach",
  "8726724": "clearwater-beach",
  "8726520": "st-petersburg",
  "8726034": "siesta-key",
  "8725520": "fort-myers",
  "8725110": "naples",
  // Gulf Coast
  "8731439": "gulf-shores",
  "8735180": "dauphin-island",
  "8744117": "biloxi",
  "8761724": "grand-isle",
  "8771341": "galveston",
  "8775237": "port-aransas",
  "8779749": "south-padre-island",
  // Southern California
  "9410170": "san-diego",
  "9410230": "la-jolla",
  "9410580": "newport-beach",
  "9410660": "los-angeles",
  "9410840": "santa-monica",
  "9411340": "santa-barbara",
  // Northern California
  "9413450": "monterey",
  "9413745": "santa-cruz",
  "9414290": "san-francisco",
  "9415020": "point-reyes",
  "9419750": "crescent-city",
  // Pacific Northwest
  "9437540": "garibaldi",
  "9437540-cannon": "cannon-beach",
  "9439040": "astoria",
  "9441102": "westport",
  "9442396": "la-push",
  "9443090": "neah-bay",
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
  // New England
  "8413320": "ME", "8418150": "ME", "8418557": "ME",
  "8429489": "NH",
  "8446121": "MA", "8449130": "MA", "8448558": "MA",
  "8452660": "RI", "8454658": "RI", "8459338": "RI",
  // Florida (both coasts)
  "8720587": "FL", "8721120": "FL", "8721164": "FL", "8721604": "FL",
  "8722956": "FL", "8723080": "FL", "8724580": "FL", "8729807": "FL",
  "8729511": "FL", "8729210": "FL", "8726724": "FL", "8726520": "FL",
  "8726034": "FL", "8725520": "FL", "8725110": "FL",
  // Gulf Coast
  "8731439": "AL", "8735180": "AL", "8744117": "MS", "8761724": "LA",
  "8771341": "TX", "8775237": "TX", "8779749": "TX",
  // California
  "9410170": "CA", "9410230": "CA", "9410580": "CA", "9410660": "CA",
  "9410840": "CA", "9411340": "CA", "9413450": "CA", "9413745": "CA",
  "9414290": "CA", "9415020": "CA", "9419750": "CA",
  // Pacific Northwest
  "9437540": "OR", "9437540-cannon": "OR", "9439040": "OR",
  "9441102": "WA", "9442396": "WA", "9443090": "WA",
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
  {
    slug: "new-england",
    region: "New England",
    title: "New England",
    blurb:
      "Big-swing northern tides from Bar Harbor and Portland down through Old Orchard, Hampton Beach, Cape Cod, the islands, and Rhode Island's ocean shore.",
  },
  {
    slug: "florida-atlantic",
    region: "Florida · Atlantic Coast",
    title: "Florida — Atlantic Coast",
    blurb:
      "Florida's east coast from St. Augustine and Daytona through Cocoa Beach, Fort Lauderdale, and Miami Beach, all the way down to Key West.",
  },
  {
    slug: "florida-gulf",
    region: "Florida · Gulf Coast",
    title: "Florida — Gulf Coast",
    blurb:
      "The Gulf side of Florida: Pensacola Beach and the panhandle, Clearwater and St. Pete, Siesta Key's sand, and south to Fort Myers and Naples.",
  },
  {
    slug: "gulf-coast",
    region: "Gulf Coast",
    title: "Gulf Coast",
    blurb:
      "Gulf beaches beyond Florida — Gulf Shores and Dauphin Island, Biloxi, Grand Isle, and the Texas coast from Galveston to South Padre Island.",
  },
  {
    slug: "southern-california",
    region: "Southern California",
    title: "Southern California",
    blurb:
      "SoCal's classic piers and coves — San Diego, La Jolla's Scripps Pier, Newport Beach, Santa Monica, and up the coast to Santa Barbara.",
  },
  {
    slug: "northern-california",
    region: "Northern California",
    title: "Northern California",
    blurb:
      "From Monterey Bay and Santa Cruz past the Golden Gate to Point Reyes and Crescent City — the cold, dramatic half of the California coast.",
  },
  {
    slug: "pacific-northwest",
    region: "Pacific Northwest",
    title: "Pacific Northwest",
    blurb:
      "Oregon and Washington's moody shores: Cannon Beach and Tillamook Bay, the Columbia at Astoria, and out to Westport, La Push, and Neah Bay.",
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
