// Nearest NOAA tide-prediction station to any US coordinate, from the full
// national dataset (~3,500 stations bundled in noaa-stations.json). Server-side
// only — the JSON never ships to the client.

import rawStations from "./noaa-stations.json";
import { distanceMiles } from "./stations";

interface RawStation {
  i: string; // id
  n: string; // name
  a: number; // lat
  o: number; // lng
  s: string; // state
  t: string; // type R/S
}

export interface NoaaStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state: string;
  type: "R" | "S";
  distanceMi: number;
}

const STATIONS = rawStations as RawStation[];

/** Title-case an ALL-CAPS NOAA name; leave mixed-case names alone. */
function prettyName(n: string): string {
  if (n !== n.toUpperCase()) return n;
  return n
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bNc\b|\bSc\b|\bNj\b|\bNy\b|\bVa\b|\bMd\b|\bDe\b|\bMa\b|\bGa\b|\bFl\b|\bRi\b|\bCt\b/g, (s) => s.toUpperCase());
}

/** The N nearest stations to a coordinate, closest first. */
export function nearestStations(lat: number, lng: number, n = 6): NoaaStation[] {
  const scored = STATIONS.map((s) => ({
    s,
    d: distanceMiles(lat, lng, s.a, s.o),
  }));
  scored.sort((x, y) => x.d - y.d);
  return scored.slice(0, n).map(({ s, d }) => ({
    id: s.i,
    name: prettyName(s.n),
    lat: s.a,
    lng: s.o,
    state: s.s,
    type: (s.t === "R" ? "R" : "S") as "R" | "S",
    distanceMi: Math.round(d * 10) / 10,
  }));
}
