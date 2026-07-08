// Local sunrise/sunset + moon phase. No network — pure astronomy.
// Sunrise/sunset uses the NOAA low-precision solar position algorithm.

import { STATION_TZ } from "./tides";

function toRad(d: number) {
  return (d * Math.PI) / 180;
}
function toDeg(r: number) {
  return (r * 180) / Math.PI;
}

/** Day-of-year for a real Date, in the station timezone. */
function dayOfYear(date: Date): { doy: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const start = Date.UTC(y, 0, 0);
  const now = Date.UTC(y, m - 1, d);
  const doy = Math.floor((now - start) / 86_400_000);
  return { doy, year: y };
}

export interface SunTimes {
  /** "6:04 AM" style local strings, or null for polar edge cases */
  sunrise: string | null;
  sunset: string | null;
}

/**
 * Sunrise/sunset for a lat/lng on the current date, returned as local wall-clock.
 * Standard-time offset for Eastern is -5; we detect DST by comparing the zone's
 * current offset so summer at OBX reads correctly.
 */
export function sunTimes(lat: number, lng: number, date = new Date()): SunTimes {
  const { doy } = dayOfYear(date);

  // Fractional gamma
  const gamma = ((2 * Math.PI) / 365) * (doy - 1 + 0.5);
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const haArg =
    Math.cos(toRad(90.833)) / (Math.cos(toRad(lat)) * Math.cos(decl)) -
    Math.tan(toRad(lat)) * Math.tan(decl);
  if (haArg > 1 || haArg < -1) {
    return { sunrise: null, sunset: null };
  }
  const ha = toDeg(Math.acos(haArg));

  // Minutes from UTC midnight
  const sunriseUTC = 720 - 4 * (lng + ha) - eqtime;
  const sunsetUTC = 720 - 4 * (lng - ha) - eqtime;

  const offsetMin = tzOffsetMinutes(date);

  const fmt = (utcMin: number): string => {
    let mins = Math.round(utcMin + offsetMin);
    mins = ((mins % 1440) + 1440) % 1440;
    let h = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  return { sunrise: fmt(sunriseUTC), sunset: fmt(sunsetUTC) };
}

/** Current offset (minutes) of the station timezone vs UTC, DST-aware. */
function tzOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

// ---- Moon rise/set (ported from the SunCalc algorithm, MIT) ----

const RAD = Math.PI / 180;
const DAY_MS_ = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

function toDaysReal(realMs: number): number {
  return realMs / DAY_MS_ - 0.5 + J1970 - J2000;
}
function rightAscension(l: number, b: number): number {
  return Math.atan2(
    Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY),
    Math.cos(l),
  );
}
function declination(l: number, b: number): number {
  return Math.asin(
    Math.sin(b) * Math.cos(OBLIQUITY) +
      Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l),
  );
}
function siderealTime(d: number, lw: number): number {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}
function astroRefraction(h: number): number {
  if (h < 0) h = 0;
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}
function moonCoords(d: number): { ra: number; dec: number } {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b) };
}
function moonAltitude(realMs: number, lat: number, lng: number): number {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDaysReal(realMs);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = Math.asin(
    Math.sin(phi) * Math.sin(c.dec) +
      Math.cos(phi) * Math.cos(c.dec) * Math.cos(H),
  );
  return h + astroRefraction(h);
}

export interface MoonTimes {
  rise: string | null;
  set: string | null;
  /** true if the moon never sets that day; alwaysDown if it never rises */
  alwaysUp: boolean;
  alwaysDown: boolean;
}

/**
 * Moonrise / moonset for the local calendar day starting at `wallDayStartMs`
 * (our wall-clock-as-UTC midnight). Returns local wall-clock strings.
 */
export function moonTimes(
  lat: number,
  lng: number,
  wallDayStartMs: number,
): MoonTimes {
  const offsetMin = tzOffsetMinutes(new Date(wallDayStartMs + 12 * 3_600_000));
  const realMidnight = wallDayStartMs - offsetMin * 60_000;
  const hc = 0.133 * RAD;
  const HOUR = 3_600_000;

  let h0 = moonAltitude(realMidnight, lat, lng) - hc;
  let rise: number | undefined;
  let set: number | undefined;

  for (let i = 1; i <= 24; i += 2) {
    const h1 = moonAltitude(realMidnight + i * HOUR, lat, lng) - hc;
    const h2 = moonAltitude(realMidnight + (i + 1) * HOUR, lat, lng) - hc;
    const a = (h0 + h2) / 2 - h1;
    const b = (h2 - h0) / 2;
    const xe = -b / (2 * a);
    const ye = (a * xe + b) * xe + h1;
    const d = b * b - 4 * a * h1;
    let roots = 0;
    let x1 = 0;
    let x2 = 0;
    if (d >= 0) {
      const dx = (Math.sqrt(d) / Math.abs(a)) * 0.5;
      x1 = xe - dx;
      x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) {
      if (h0 < 0) rise = i + x1;
      else set = i + x1;
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1);
      set = i + (ye < 0 ? x1 : x2);
    }
    if (rise !== undefined && set !== undefined) break;
    h0 = h2;
  }

  const fmt = (hours?: number): string | null => {
    if (hours === undefined) return null;
    const mins = Math.round((((hours % 24) + 24) % 24) * 60);
    let hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${String(mm).padStart(2, "0")} ${ampm}`;
  };

  return {
    rise: fmt(rise),
    set: fmt(set),
    alwaysUp: rise === undefined && set === undefined && h0 > 0,
    alwaysDown: rise === undefined && set === undefined && h0 <= 0,
  };
}

export interface MoonPhase {
  /** 0..1 through the synodic cycle */
  fraction: number;
  /** illuminated fraction 0..1 */
  illumination: number;
  name: string;
  emoji: string;
}

// Reference new moon: 2000-01-06 18:14 UTC
const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) / 86_400_000;

export function moonPhase(date = new Date()): MoonPhase {
  const days = date.getTime() / 86_400_000 - REF_NEW_MOON;
  let fraction = (days % SYNODIC) / SYNODIC;
  if (fraction < 0) fraction += 1;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;

  const phases: [number, string, string][] = [
    [0.03, "New Moon", "🌑"],
    [0.22, "Waxing Crescent", "🌒"],
    [0.28, "First Quarter", "🌓"],
    [0.47, "Waxing Gibbous", "🌔"],
    [0.53, "Full Moon", "🌕"],
    [0.72, "Waning Gibbous", "🌖"],
    [0.78, "Last Quarter", "🌗"],
    [0.97, "Waning Crescent", "🌘"],
    [1.01, "New Moon", "🌑"],
  ];
  const [, name, emoji] = phases.find(([edge]) => fraction < edge)!;
  return { fraction, illumination, name, emoji };
}
