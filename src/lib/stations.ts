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


// Florida Atlantic coast — north → south. (Verified NOAA ids, 2026-08-16.)
const FLORIDA_ATLANTIC: Omit<Station, "region">[] = [
  { id: "8720587", label: "St. Augustine Beach", stationName: "St. Augustine Beach", lat: 29.8567, lng: -81.2633, type: "R", exposure: "ocean" },
  { id: "8721120", label: "Daytona Beach", stationName: "Daytona Beach Shores, Sunglow Pier", lat: 29.1467, lng: -80.9633, type: "S", exposure: "ocean", note: "Sunglow Pier" },
  { id: "8721164", label: "New Smyrna Beach", stationName: "New Smyrna Beach", lat: 29.0233, lng: -80.9183, type: "R", exposure: "ocean" },
  { id: "8721604", label: "Cocoa Beach", stationName: "Port Canaveral (Trident Pier)", lat: 28.4158, lng: -80.5931, type: "R", exposure: "ocean", note: "Trident Pier, Port Canaveral" },
  { id: "8722956", label: "Fort Lauderdale", stationName: "South Port Everglades, ICWW", lat: 26.0817, lng: -80.1167, type: "R", exposure: "inlet", note: "Port Everglades" },
  { id: "8723080", label: "Miami Beach", stationName: "Haulover Pier, N. Miami Beach", lat: 25.9033, lng: -80.12, type: "R", exposure: "ocean", note: "Haulover Pier" },
  { id: "8724580", label: "Key West", stationName: "Key West", lat: 24.5557, lng: -81.8079, type: "R", exposure: "bay", note: "Key West Harbor" },
];

// Florida Gulf coast — north → south along the panhandle, then down the peninsula.
const FLORIDA_GULF: Omit<Station, "region">[] = [
  { id: "8729807", label: "Pensacola Beach", stationName: "Pensacola Beach Pier", lat: 30.3275, lng: -87.1419, type: "R", exposure: "ocean" },
  { id: "8729511", label: "Destin", stationName: "East Pass (Destin)", lat: 30.395, lng: -86.5133, type: "S", exposure: "inlet", note: "East Pass" },
  { id: "8729210", label: "Panama City Beach", stationName: "Panama City Beach", lat: 30.2138, lng: -85.8786, type: "R", exposure: "ocean" },
  { id: "8726724", label: "Clearwater Beach", stationName: "Clearwater Beach", lat: 27.9783, lng: -82.8317, type: "R", exposure: "ocean" },
  { id: "8726520", label: "St. Petersburg", stationName: "St. Petersburg", lat: 27.7606, lng: -82.6269, type: "R", exposure: "bay", note: "Tampa Bay" },
  { id: "8726034", label: "Siesta Key", stationName: "Siesta Key, Big Sarasota Pass", lat: 27.2839, lng: -82.565, type: "R", exposure: "inlet", note: "Big Sarasota Pass" },
  { id: "8725520", label: "Fort Myers", stationName: "Fort Myers", lat: 26.6478, lng: -81.8711, type: "R", exposure: "bay", note: "Caloosahatchee River" },
  { id: "8725110", label: "Naples", stationName: "Naples (outer coast)", lat: 26.1317, lng: -81.8075, type: "R", exposure: "ocean" },
];

// Gulf Coast beyond Florida — east → west, AL / MS / LA / TX.
const GULF_COAST: Omit<Station, "region">[] = [
  { id: "8731439", label: "Gulf Shores", stationName: "Gulf Shores, ICWW", lat: 30.2799, lng: -87.6843, type: "R", exposure: "sound", note: "ICWW gauge" },
  { id: "8735180", label: "Dauphin Island", stationName: "Dauphin Island", lat: 30.25, lng: -88.075, type: "R", exposure: "ocean" },
  { id: "8744117", label: "Biloxi", stationName: "Biloxi", lat: 30.4117, lng: -88.9033, type: "R", exposure: "bay", note: "Biloxi Bay" },
  { id: "8761724", label: "Grand Isle", stationName: "East Point, Grand Isle", lat: 29.2633, lng: -89.9567, type: "R", exposure: "ocean" },
  { id: "8771341", label: "Galveston", stationName: "Galveston Bay Entrance, North Jetty", lat: 29.3575, lng: -94.7247, type: "R", exposure: "inlet", note: "Bay entrance, North Jetty" },
  { id: "8775237", label: "Port Aransas", stationName: "Port Aransas", lat: 27.8397, lng: -97.0725, type: "R", exposure: "inlet" },
  { id: "8779749", label: "South Padre Island", stationName: "South Padre Island, Brazos Santiago Pass", lat: 26.0675, lng: -97.1548, type: "R", exposure: "inlet", note: "Brazos Santiago Pass" },
];

// Southern California — south → north. (Pacific: one big swing per day matters.)
const SOCAL: Omit<Station, "region">[] = [
  { id: "9410170", label: "San Diego", stationName: "San Diego (Broadway)", lat: 32.7142, lng: -117.1736, type: "R", exposure: "bay", note: "San Diego Bay" },
  { id: "9410230", label: "La Jolla", stationName: "La Jolla (Scripps Institution Wharf)", lat: 32.8669, lng: -117.2571, type: "R", exposure: "ocean", note: "Scripps Pier" },
  { id: "9410580", label: "Newport Beach", stationName: "Newport Bay Entrance, Corona del Mar", lat: 33.6033, lng: -117.883, type: "R", exposure: "inlet", note: "Corona del Mar" },
  { id: "9410660", label: "Los Angeles", stationName: "Los Angeles (Outer Harbor)", lat: 33.72, lng: -118.272, type: "R", exposure: "bay", note: "Outer Harbor, San Pedro" },
  { id: "9410840", label: "Santa Monica", stationName: "Santa Monica, Municipal Pier", lat: 34.0083, lng: -118.5, type: "R", exposure: "ocean", note: "Municipal Pier" },
  { id: "9411340", label: "Santa Barbara", stationName: "Santa Barbara", lat: 34.4046, lng: -119.6925, type: "R", exposure: "bay", note: "Santa Barbara Harbor" },
];

// Northern California — south → north.
const NORCAL: Omit<Station, "region">[] = [
  { id: "9413450", label: "Monterey", stationName: "Monterey, Monterey Bay", lat: 36.6089, lng: -121.8914, type: "R", exposure: "bay", note: "Monterey Harbor" },
  { id: "9413745", label: "Santa Cruz", stationName: "Santa Cruz, Monterey Bay", lat: 36.9583, lng: -122.017, type: "S", exposure: "ocean", note: "Municipal Wharf" },
  { id: "9414290", label: "San Francisco", stationName: "San Francisco (Golden Gate)", lat: 37.8063, lng: -122.4659, type: "R", exposure: "ocean", note: "Golden Gate / Ocean Beach" },
  { id: "9415020", label: "Point Reyes", stationName: "Point Reyes", lat: 37.9942, lng: -122.9736, type: "R", exposure: "ocean" },
  { id: "9419750", label: "Crescent City", stationName: "Crescent City", lat: 41.7456, lng: -124.1844, type: "R", exposure: "ocean" },
];

// Pacific Northwest — south → north, OR then WA.
const PNW: Omit<Station, "region">[] = [
  { id: "9437540", label: "Garibaldi", stationName: "Garibaldi", lat: 45.5545, lng: -123.9189, type: "R", exposure: "bay", note: "Tillamook Bay" },
  { id: "9437540-cannon", label: "Cannon Beach", stationName: "Garibaldi", lat: 45.8918, lng: -123.9615, type: "R", exposure: "ocean", note: "Nearest gauge (Garibaldi, Tillamook Bay)" },
  { id: "9439040", label: "Astoria", stationName: "Astoria (Tongue Point), Oreg.", lat: 46.2073, lng: -123.7683, type: "R", exposure: "bay", note: "Columbia River" },
  { id: "9441102", label: "Westport", stationName: "Westport, Point Chehalis", lat: 46.9043, lng: -124.1051, type: "R", exposure: "ocean", note: "Point Chehalis" },
  { id: "9442396", label: "La Push", stationName: "La Push, Quillayute River", lat: 47.9128, lng: -124.6357, type: "R", exposure: "ocean" },
  { id: "9443090", label: "Neah Bay", stationName: "Neah Bay", lat: 48.3707, lng: -124.6016, type: "R", exposure: "sound", note: "Strait of Juan de Fuca" },
];

// New England — north → south, ME / NH / MA / RI.
const NEW_ENGLAND: Omit<Station, "region">[] = [
  { id: "8413320", label: "Bar Harbor", stationName: "Bar Harbor", lat: 44.3922, lng: -68.2043, type: "R", exposure: "ocean" },
  { id: "8418150", label: "Portland, ME", stationName: "Portland", lat: 43.6581, lng: -70.2442, type: "R", exposure: "bay", note: "Casco Bay" },
  { id: "8418557", label: "Old Orchard Beach", stationName: "Old Orchard Beach", lat: 43.5167, lng: -70.3667, type: "S", exposure: "ocean" },
  { id: "8429489", label: "Hampton Beach", stationName: "Hampton Harbor", lat: 42.895, lng: -70.8167, type: "S", exposure: "inlet", note: "Hampton Harbor" },
  { id: "8446121", label: "Provincetown", stationName: "Provincetown", lat: 42.0496, lng: -70.1822, type: "R", exposure: "bay", note: "Cape Cod Bay" },
  { id: "8449130", label: "Nantucket", stationName: "Nantucket", lat: 41.285, lng: -70.0967, type: "R", exposure: "bay", note: "Nantucket Harbor" },
  { id: "8448558", label: "Martha's Vineyard", stationName: "Edgartown", lat: 41.3883, lng: -70.5117, type: "R", exposure: "bay", note: "Edgartown Harbor" },
  { id: "8452660", label: "Newport, RI", stationName: "Newport", lat: 41.5043, lng: -71.3261, type: "R", exposure: "bay", note: "Narragansett Bay" },
  { id: "8454658", label: "Narragansett", stationName: "Narragansett Pier", lat: 41.4217, lng: -71.455, type: "S", exposure: "ocean" },
  { id: "8459338", label: "Block Island", stationName: "Block Island (Old Harbor)", lat: 41.1733, lng: -71.5567, type: "R", exposure: "ocean", note: "Old Harbor" },
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
  ...withRegion(NEW_ENGLAND, "New England"),
  ...withRegion(FLORIDA_ATLANTIC, "Florida · Atlantic Coast"),
  ...withRegion(FLORIDA_GULF, "Florida · Gulf Coast"),
  ...withRegion(GULF_COAST, "Gulf Coast"),
  ...withRegion(SOCAL, "Southern California"),
  ...withRegion(NORCAL, "Northern California"),
  ...withRegion(PNW, "Pacific Northwest"),
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
