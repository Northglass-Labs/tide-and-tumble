// Live marine conditions — surf (wave height + period), wind, and ocean water
// temperature — for ANY US beach. Finds the nearest NDBC buoys to the beach and
// reads their realtime feed; falls back to NOAA CO-OPS wind/water-temp where the
// tide station has sensors. Every field degrades gracefully.

import ndbcRaw from "./ndbc-stations.json";
import { distanceMiles } from "./stations";
import {
  fetchWithTimeout,
  readFirstDataLine,
  readJsonBounded,
} from "./upstream";

const UPSTREAM_TIMEOUT_MS = 4_000;
/** The header and the newest row of an NDBC file fit well within this; the rest is never read. */
const NDBC_HEAD_BYTES = 16 * 1024;
const COOPS_MAX_BYTES = 256 * 1024;

export interface Marine {
  waterTempF: number | null;
  windMph: number | null;
  windDir: string | null;
  windGustMph: number | null;
  surfFt: number | null;
  surfPeriodS: number | null;
  source: string | null;
}

interface NdbcRaw {
  i: string;
  a: number;
  o: number;
  t: "b" | "f";
}
const NDBC = ndbcRaw as NdbcRaw[];
const MAX_MI = 170; // don't attribute far-away buoy conditions to a beach

/** An NDBC station to ask, nearest first: its id, whether it is a buoy with wave sensors, its file. */
export interface BuoyCandidate {
  id: string;
  wave: boolean;
  d: number;
  url: string;
}

/**
 * The stations asked for a beach: the five nearest of any kind (water
 * temperature, wind), and the three nearest buoys, which alone measure waves:
 * almost every fixed (C-MAN) station has no wave sensor, and near a harbor
 * the five nearest are often all fixed ones. Within MAX_MI, nearest first.
 * NDBC names its files by upper-case id.
 */
export function buoyCandidates(lat: number, lng: number): BuoyCandidate[] {
  const ranked = NDBC.map((s) => ({ s, d: distanceMiles(lat, lng, s.a, s.o) }))
    .filter((c) => c.d <= MAX_MI)
    .sort((x, y) => x.d - y.d);
  const chosen = new Set([...ranked.slice(0, 5), ...ranked.filter((c) => c.s.t === "b").slice(0, 3)]);
  return ranked
    .filter((c) => chosen.has(c))
    .map((c) => ({
      id: c.s.i,
      wave: c.s.t === "b",
      d: c.d,
      url: `https://www.ndbc.noaa.gov/data/realtime2/${c.s.i.toUpperCase()}.txt`,
    }));
}

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];
const compass = (deg: number) => COMPASS[Math.round(deg / 22.5) % 16];
const num = (s: string | undefined): number | null => {
  if (s == null || s === "MM" || s === "") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

interface Buoy {
  waveFt: number | null;
  periodS: number | null;
  waterTempF: number | null;
  windMph: number | null;
  windDir: string | null;
  windGustMph: number | null;
}

async function fetchBuoy(
  url: string,
  signal?: AbortSignal,
): Promise<Buoy | null> {
  try {
    const res = await fetchWithTimeout(url, { signal }, UPSTREAM_TIMEOUT_MS);
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    // First non-# line is newest, and the only one read. Columns: 5=WDIR
    // 6=WSPD 7=GST 8=WVHT 9=DPD ... 14=WTMP (see NDBC realtime2 header).
    const row = await readFirstDataLine(res, NDBC_HEAD_BYTES);
    if (!row) return null;
    const c = row.trim().split(/\s+/);
    const wvht = num(c[8]);
    const wtmp = num(c[14]);
    const wspd = num(c[6]);
    const wdir = num(c[5]);
    const gst = num(c[7]);
    return {
      waveFt: wvht != null ? wvht * 3.28084 : null,
      periodS: num(c[9]),
      waterTempF: wtmp != null ? (wtmp * 9) / 5 + 32 : null,
      windMph: wspd != null ? wspd * 2.23694 : null,
      windDir: wdir != null ? compass(wdir) : null,
      windGustMph: gst != null ? gst * 2.23694 : null,
    };
  } catch {
    return null;
  }
}

const COOPS = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

async function fetchCoopsWind(id: string, signal?: AbortSignal) {
  try {
    const p = new URLSearchParams({
      product: "wind", date: "latest", station: id,
      units: "english", time_zone: "lst_ldt", format: "json", application: "obx-tides",
    });
    const res = await fetchWithTimeout(
      `${COOPS}?${p}`,
      { signal },
      UPSTREAM_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const d = await readJsonBounded<Record<string, unknown>>(res, COOPS_MAX_BYTES);
    const data = Array.isArray(d.data) ? d.data : [];
    const row = data[0] as Record<string, string | undefined> | undefined;
    if (!row) return null;
    const KT = 1.15078;
    const s = num(row.s);
    const g = num(row.g);
    return {
      windMph: s != null ? s * KT : null,
      windDir: typeof row.dr === "string" ? row.dr : null,
      windGustMph: g != null ? g * KT : null,
    };
  } catch {
    return null;
  }
}

async function fetchCoopsWaterTemp(
  id: string,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const p = new URLSearchParams({
      product: "water_temperature", date: "latest", station: id,
      units: "english", time_zone: "lst_ldt", format: "json", application: "obx-tides",
    });
    const res = await fetchWithTimeout(
      `${COOPS}?${p}`,
      { signal },
      UPSTREAM_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const d = await readJsonBounded<Record<string, unknown>>(res, COOPS_MAX_BYTES);
    const data = Array.isArray(d.data) ? d.data : [];
    const row = data[0] as Record<string, string | undefined> | undefined;
    return num(row?.v);
  } catch {
    return null;
  }
}

const EMPTY: Marine = {
  waterTempF: null, windMph: null, windDir: null, windGustMph: null,
  surfFt: null, surfPeriodS: null, source: null,
};

export async function fetchMarine(opts: {
  noaaId?: string;
  lat: number;
  lng: number;
  signal?: AbortSignal;
}): Promise<Marine> {
  if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) return EMPTY;

  const cands = buoyCandidates(opts.lat, opts.lng);
  const settled = await Promise.allSettled(
    cands.map((c) => fetchBuoy(c.url, opts.signal)),
  );
  const readings = cands.map((c, i) => ({
    id: c.id,
    d: c.d,
    r: settled[i].status === "fulfilled" ? settled[i].value : null,
  }));

  const surf = readings.find((x) => x.r?.waveFt != null);
  const temp = readings.find((x) => x.r?.waterTempF != null);

  // Wind: prefer the tide station's own CO-OPS sensor, else nearest buoy.
  let windMph: number | null = null;
  let windDir: string | null = null;
  let windGustMph: number | null = null;
  let windSrc: string | null = null;
  if (opts.noaaId) {
    const cw = await fetchCoopsWind(opts.noaaId, opts.signal);
    if (cw?.windMph != null) {
      windMph = cw.windMph;
      windDir = cw.windDir;
      windGustMph = cw.windGustMph;
      windSrc = `NOAA ${opts.noaaId}`;
    }
  }
  if (windMph == null) {
    const bw = readings.find((x) => x.r?.windMph != null);
    if (bw?.r) {
      windMph = bw.r.windMph;
      windDir = bw.r.windDir;
      windGustMph = bw.r.windGustMph;
      windSrc = `NDBC ${bw.id}`;
    }
  }

  // Water temp: ocean buoy first, else the tide station's CO-OPS sensor.
  let waterTempF = temp?.r?.waterTempF ?? null;
  if (waterTempF == null && opts.noaaId) {
    waterTempF = await fetchCoopsWaterTemp(opts.noaaId, opts.signal);
  }

  const sources: string[] = [];
  if (surf) sources.push(`NDBC ${surf.id}`);
  if (windSrc && !sources.includes(windSrc)) sources.push(windSrc);

  return {
    waterTempF,
    windMph,
    windDir,
    windGustMph,
    surfFt: surf?.r?.waveFt ?? null,
    surfPeriodS: surf?.r?.periodS ?? null,
    source: sources.length ? sources.join(" · ") : null,
  };
}
