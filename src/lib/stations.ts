// OBX NOAA CO-OPS tide stations, north → south.
// Verified against api.tidesandcurrents.noaa.gov station metadata (mdapi).
// type: "R" = harmonic/reference, "S" = subordinate (hi/lo only).
// We derive the tide curve from hi/lo events via cosine interpolation for ALL
// stations, so both types render identically and accurately.

export type StationType = "R" | "S";
export type Exposure = "ocean" | "inlet" | "sound" | "bay";

/**
 * The active beach shown in the app. Curated beaches are full Stations; a beach
 * resolved from the user's location (nearest NOAA station nationwide) is a
 * lighter ActiveStation with the NOAA name as its label.
 */
export interface ActiveStation {
  /** NOAA id, optionally with a "-suffix" for curated town disambiguation */
  id: string;
  /** Friendly display name for the beach/town */
  label: string;
  /** Official NOAA station name */
  stationName: string;
  lat: number;
  lng: number;
  exposure?: Exposure;
  /** Short note shown in the picker */
  note?: string;
  region?: string;
}

export interface Station extends ActiveStation {
  type: StationType;
  exposure: Exposure;
  region: string;
}

// Curated beaches by region. Ordered north → south within each region.
const OBX_BEACHES: Omit<Station, "region">[] = [
  {
    id: "8651370",
    label: "Corolla",
    stationName: "Duck Pier",
    lat: 36.1833,
    lng: -75.7467,
    type: "R",
    exposure: "ocean",
    note: "Nearest ocean station (Duck Pier)",
  },
  {
    id: "8651370-duck",
    label: "Duck",
    stationName: "Duck Pier",
    lat: 36.1833,
    lng: -75.7467,
    type: "R",
    exposure: "ocean",
  },
  {
    id: "8651605",
    label: "Kitty Hawk",
    stationName: "Kitty Hawk",
    lat: 36.1017,
    lng: -75.71,
    type: "S",
    exposure: "ocean",
  },
  {
    id: "8651605-kdh",
    label: "Kill Devil Hills",
    stationName: "Kitty Hawk",
    lat: 36.0257,
    lng: -75.6713,
    type: "S",
    exposure: "ocean",
    note: "Nearest ocean station (Kitty Hawk)",
  },
  {
    id: "8652226",
    label: "Nags Head",
    stationName: "Jennette's Pier",
    lat: 35.91,
    lng: -75.5917,
    type: "S",
    exposure: "ocean",
  },
  {
    id: "8652587",
    label: "Oregon Inlet",
    stationName: "Oregon Inlet Marina",
    lat: 35.7957,
    lng: -75.5482,
    type: "R",
    exposure: "inlet",
  },
  {
    id: "8653215",
    label: "Rodanthe",
    stationName: "Rodanthe, Pamlico Sound",
    lat: 35.595,
    lng: -75.4717,
    type: "R",
    exposure: "sound",
    note: "Sound-side",
  },
  {
    id: "8654400",
    label: "Avon",
    stationName: "Cape Hatteras Fishing Pier",
    lat: 35.2233,
    lng: -75.635,
    type: "R",
    exposure: "ocean",
    note: "Cape Hatteras Pier (also serves Buxton)",
  },
  {
    id: "8654400-buxton",
    label: "Buxton",
    stationName: "Cape Hatteras Fishing Pier",
    lat: 35.2673,
    lng: -75.5419,
    type: "R",
    exposure: "ocean",
    note: "Nearest ocean station (Cape Hatteras Pier)",
  },
  {
    id: "8654467",
    label: "Hatteras",
    stationName: "Hatteras",
    lat: 35.2086,
    lng: -75.7042,
    type: "R",
    exposure: "ocean",
  },
  {
    id: "8654769",
    label: "Ocracoke",
    stationName: "Ocracoke, Pamlico Sound",
    lat: 35.1155,
    lng: -75.9869,
    type: "R",
    exposure: "sound",
    note: "Sound-side",
  },
];

// Cape Fear / Wilmington, NC — north → south. (Verified NOAA ids.)
const CAPE_FEAR: Omit<Station, "region">[] = [
  { id: "8657419", label: "Topsail Beach", stationName: "Ocean City Beach Pier", lat: 34.4517, lng: -77.495, type: "S", exposure: "ocean", note: "Topsail Island ocean pier" },
  { id: "8658163", label: "Wrightsville Beach", stationName: "Wrightsville Beach", lat: 34.2133, lng: -77.7867, type: "R", exposure: "ocean" },
  { id: "8658559", label: "Carolina Beach", stationName: "Wilmington Beach", lat: 34.0317, lng: -77.8933, type: "S", exposure: "ocean" },
  { id: "8658559-kure", label: "Kure Beach", stationName: "Wilmington Beach", lat: 33.99, lng: -77.9067, type: "S", exposure: "ocean", note: "Nearest ocean gauge (Wilmington Beach)" },
  { id: "8658741", label: "Fort Fisher", stationName: "Zekes Island", lat: 33.95, lng: -77.9517, type: "R", exposure: "inlet" },
  { id: "8658901", label: "Bald Head Island", stationName: "Bald Head", lat: 33.88, lng: -78.0017, type: "S", exposure: "inlet", note: "Cape Fear River mouth" },
  { id: "8659084", label: "Southport", stationName: "Southport", lat: 33.915, lng: -78.0183, type: "R", exposure: "bay", note: "Cape Fear River" },
  { id: "8658120", label: "Wilmington", stationName: "Wilmington", lat: 34.2267, lng: -77.9533, type: "R", exposure: "bay", note: "Cape Fear River, downtown" },
];

// Jersey Shore, NJ — north → south.
const JERSEY: Omit<Station, "region">[] = [
  { id: "8531680", label: "Sandy Hook", stationName: "Sandy Hook, Fort Hancock", lat: 40.4669, lng: -74.0094, type: "R", exposure: "ocean" },
  { id: "8532337", label: "Belmar", stationName: "Belmar, Atlantic Ocean", lat: 40.185, lng: -74.0083, type: "S", exposure: "ocean", note: "Shark River area" },
  { id: "8532591", label: "Point Pleasant", stationName: "Manasquan Inlet, USCG", lat: 40.1017, lng: -74.035, type: "S", exposure: "inlet" },
  { id: "8533615", label: "Barnegat", stationName: "Barnegat Inlet, USCG", lat: 39.7617, lng: -74.1117, type: "R", exposure: "inlet" },
  { id: "8533615-lbi", label: "Long Beach Island", stationName: "Barnegat Inlet, USCG", lat: 39.5483, lng: -74.2567, type: "R", exposure: "inlet", note: "Nearest ocean gauge (Barnegat Inlet)" },
  { id: "8534720", label: "Atlantic City", stationName: "Atlantic City, Atlantic Ocean", lat: 39.3567, lng: -74.4181, type: "R", exposure: "ocean" },
  { id: "8534770", label: "Ocean City, NJ", stationName: "Ventnor City, ocean pier", lat: 39.335, lng: -74.4767, type: "R", exposure: "ocean" },
  { id: "8535835", label: "Wildwood", stationName: "Wildwood Crest, ocean pier", lat: 38.975, lng: -74.8233, type: "R", exposure: "ocean" },
  { id: "8535962", label: "Cape May", stationName: "Cape May, Atlantic Ocean", lat: 38.93, lng: -74.935, type: "S", exposure: "ocean" },
];

// A wide sweep of other popular US East Coast beaches — north → south.
const MORE_BEACHES: Omit<Station, "region">[] = [
  { id: "8447435", label: "Cape Cod (Chatham)", stationName: "Chatham Harbor, Aunt Lydias Cove", lat: 41.6885, lng: -69.9511, type: "R", exposure: "ocean" },
  { id: "8510560", label: "Montauk", stationName: "Montauk, Fort Pond Bay", lat: 41.0483, lng: -71.9594, type: "R", exposure: "bay" },
  { id: "8512354", label: "The Hamptons", stationName: "Shinnecock Inlet", lat: 40.8367, lng: -72.48, type: "R", exposure: "inlet", note: "Southampton ocean beaches" },
  { id: "8516881", label: "Rockaway Beach", stationName: "East Rockaway Inlet", lat: 40.595, lng: -73.7433, type: "R", exposure: "inlet" },
  { id: "8516385", label: "Jones Beach", stationName: "Jones Inlet, Point Lookout", lat: 40.5867, lng: -73.5783, type: "S", exposure: "inlet" },
  { id: "8557863", label: "Rehoboth Beach", stationName: "Rehoboth Beach", lat: 38.72, lng: -75.0833, type: "S", exposure: "ocean" },
  { id: "8570280", label: "Ocean City, MD", stationName: "Ocean City Fishing Pier", lat: 38.3267, lng: -75.0833, type: "R", exposure: "ocean" },
  { id: "8639168", label: "Virginia Beach", stationName: "Virginia Beach", lat: 36.8433, lng: -75.9717, type: "S", exposure: "ocean" },
  { id: "8661070", label: "Myrtle Beach", stationName: "Springmaid Pier", lat: 33.655, lng: -78.9183, type: "R", exposure: "ocean" },
  { id: "8665530", label: "Charleston / Folly", stationName: "Charleston, Customhouse Wharf", lat: 32.7808, lng: -79.9236, type: "R", exposure: "bay", note: "Harbor entrance" },
  { id: "8670892", label: "Tybee Island", stationName: "Tybee Light", lat: 32.0283, lng: -80.855, type: "S", exposure: "ocean" },
];

function withRegion(
  beaches: Omit<Station, "region">[],
  region: string,
): Station[] {
  return beaches.map((b) => ({ ...b, region }));
}

// All curated beaches, grouped region by region. Nearest-station lookup covers
// everywhere else in the US via the full NOAA dataset (see lib/nearest.ts).
export const STATIONS: Station[] = [
  ...withRegion(OBX_BEACHES, "Outer Banks, NC"),
  ...withRegion(CAPE_FEAR, "Cape Fear · Wilmington, NC"),
  ...withRegion(JERSEY, "Jersey Shore, NJ"),
  ...withRegion(MORE_BEACHES, "More US beaches"),
];

/** Curated regions in display order, each with its beaches. */
export function regions(): { region: string; beaches: Station[] }[] {
  const order: string[] = [];
  const map = new Map<string, Station[]>();
  for (const s of STATIONS) {
    if (!map.has(s.region)) {
      map.set(s.region, []);
      order.push(s.region);
    }
    map.get(s.region)!.push(s);
  }
  return order.map((region) => ({ region, beaches: map.get(region)! }));
}

/** The NOAA id NOAA actually understands (strip our local disambiguating suffix). */
export function noaaId(station: { id: string }): string {
  return station.id.split("-")[0];
}

export function findStation(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}

/** Curated beach that maps to a given raw NOAA id, if any. */
export function curatedByNoaa(rawNoaaId: string): Station | undefined {
  return STATIONS.find((s) => noaaId(s) === rawNoaaId);
}

/** Build an ActiveStation from a nearest-lookup NOAA station result. */
export function activeFromNoaa(ns: {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state?: string;
}): ActiveStation {
  const curated = curatedByNoaa(ns.id);
  if (curated) return curated;
  // Strip a trailing ", NC" style state suffix for a cleaner label.
  const label = ns.name.replace(/,\s*[A-Z]{2}\s*$/, "").trim() || ns.name;
  return {
    id: ns.id,
    label,
    stationName: ns.name + (ns.state ? `, ${ns.state}` : ""),
    lat: ns.lat,
    lng: ns.lng,
  };
}

const R = 3959; // Earth radius, miles

/** Haversine distance in miles. */
export function distanceMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Nearest station to a coordinate. Prefers ocean-facing stations so beach-goers
 * get surf tides, not sound tides, unless a sound station is dramatically closer.
 */
export function nearestStation(lat: number, lng: number): Station {
  const scored = STATIONS.map((s) => ({
    s,
    d: distanceMiles(lat, lng, s.lat, s.lng),
  }));
  scored.sort((a, b) => a.d - b.d);
  const closest = scored[0];
  const closestOcean = scored.find(
    ({ s }) => s.exposure === "ocean" || s.exposure === "inlet",
  );
  if (
    closestOcean &&
    closestOcean.d <= closest.d + 12 // within 12 mi, prefer the ocean read
  ) {
    return closestOcean.s;
  }
  return closest.s;
}
