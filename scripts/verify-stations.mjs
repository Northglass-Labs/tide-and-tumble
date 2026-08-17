// Verify every curated station in src/lib/stations.ts against NOAA's
// tide-predictions station list (keyless public mdapi).
//
//   npx tsx scripts/verify-stations.mjs          # fetches the live list
//   NOAA_STATIONS_JSON=path npx tsx scripts/...  # offline, from a saved list
//
// Checks, per curated beach:
//   FAIL  id (suffix stripped) missing from NOAA's tide-prediction stations
//   FAIL  harmonic/subordinate type differs from NOAA's
//   WARN  entry coords > 30 mi from the NOAA gauge (entries may legitimately
//         use the TOWN's coords when a beach borrows a nearby gauge — the
//         "-suffix" pattern — so distance is a review nudge, not an error)
//   WARN  stationName differs from NOAA's current official name
//
// Exit code 1 on any FAIL, so a pre-release check can gate on it.
import { readFileSync } from "node:fs";
import { STATIONS, noaaId } from "../src/lib/stations";

const LIST_URL =
  "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions";

const raw = process.env.NOAA_STATIONS_JSON
  ? JSON.parse(readFileSync(process.env.NOAA_STATIONS_JSON, "utf8"))
  : await (await fetch(LIST_URL)).json();
const byId = new Map(raw.stations.map((s) => [s.id, s]));

const R = 3958.8; // earth radius, miles
const rad = (d) => (d * Math.PI) / 180;
function miles(aLat, aLng, bLat, bLng) {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let fails = 0, warns = 0;
for (const s of STATIONS) {
  const id = noaaId(s);
  const n = byId.get(id);
  if (!n) { console.log(`FAIL  ${s.id}  ${s.label}: not in NOAA tide-prediction list`); fails++; continue; }
  if (n.type !== s.type) { console.log(`FAIL  ${s.id}  ${s.label}: type ${s.type} but NOAA says ${n.type}`); fails++; }
  const d = miles(s.lat, s.lng, n.lat, n.lng);
  if (d > 30) { console.log(`WARN  ${s.id}  ${s.label}: entry coords ${d.toFixed(1)} mi from gauge "${n.name}"`); warns++; }
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!norm(n.name).includes(norm(s.stationName).slice(0, 12)) && !norm(s.stationName).includes(norm(n.name).slice(0, 12))) {
    console.log(`WARN  ${s.id}  ${s.label}: stationName "${s.stationName}" vs NOAA "${n.name}"`); warns++;
  }
}
console.log(`\n${STATIONS.length} curated beaches — ${fails} FAIL, ${warns} WARN`);
process.exit(fails ? 1 : 0);
