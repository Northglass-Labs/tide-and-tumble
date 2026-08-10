// Tide math + NOAA CO-OPS fetching.
//
// Strategy: fetch hi/lo events (interval=hilo) which every OBX station supports,
// then reconstruct the continuous curve with cosine interpolation between
// consecutive extrema. Tides are near-sinusoidal between a high and a low, so
// this is accurate to within a couple inches and works uniformly for both
// harmonic (R) and subordinate (S) stations.

export interface Extremum {
  /** epoch milliseconds (local wall-clock interpreted as the station's local time) */
  time: number;
  /** height in feet, MLLW datum */
  height: number;
  type: "H" | "L";
}

export type Direction = "rising" | "falling";
export type Phase =
  | "rising"
  | "falling"
  | "high-slack"
  | "low-slack";

export interface TidePoint {
  time: number;
  height: number;
}

export interface TideNow {
  /** current interpolated height, ft */
  height: number;
  /** rate of change, ft/hr (positive = rising) */
  rate: number;
  direction: Direction;
  phase: Phase;
  /** 0..1 where 0 = today's lowest low, 1 = today's highest high */
  level: number;
  nextHigh?: Extremum;
  nextLow?: Extremum;
  prevExtremum?: Extremum;
  nextExtremum?: Extremum;
}

export interface TideDay {
  /** the extrema across the fetched window (yesterday..+2d) */
  extrema: Extremum[];
  /** smooth curve points for the local calendar day, 00:00→24:00 */
  curve: TidePoint[];
  /** min/max height across today's curve, for normalization/labels */
  dayMin: number;
  dayMax: number;
  now: TideNow;
  /** the moment (ms) the curve/now was computed for */
  computedFor: number;
}

const NOAA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

/** OBX is Eastern. All stations share this zone. */
export const STATION_TZ = "America/New_York";

/**
 * "Now" expressed in the station's local wall-clock, as a UTC-epoch — the same
 * convention parseNoaaTime uses. This makes the current-time comparisons line up
 * with NOAA's lst_ldt timestamps no matter where the viewer's device is.
 */
export function stationNow(realNow: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(realNow);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
}

export const DAY_MS = 86_400_000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Midnight (our wall-clock-as-UTC convention) of the calendar day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Weekday / month / date parts of a wall-clock epoch. */
export function dayParts(ms: number): {
  weekday: string;
  month: string;
  date: number;
} {
  const d = new Date(ms);
  return {
    weekday: WEEKDAYS[d.getUTCDay()],
    month: MONTHS[d.getUTCMonth()],
    date: d.getUTCDate(),
  };
}

/** e.g. "Sun, Jul 12". */
export function fmtDayLabel(ms: number): string {
  const p = dayParts(ms);
  return `${p.weekday}, ${p.month} ${p.date}`;
}

/** Format a wall-clock epoch (our UTC convention) as e.g. "4:12 PM". */
export function fmtClock(t: number): string {
  const d = new Date(t);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * NOAA returns local wall-clock strings like "2026-07-05 11:50" (time_zone=lst_ldt).
 * We parse them as if UTC to get a stable, monotonic epoch for interpolation math.
 * Because everything (now, extrema, curve) is parsed the same way and rendered by
 * pulling hours/minutes back out in the same frame, the wall-clock times stay
 * correct for the station regardless of the viewer's own timezone.
 */
export function parseNoaaTime(s: string): number {
  // "YYYY-MM-DD HH:MM" -> Date.UTC
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return NaN;
  const [, y, mo, d, h, mi] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi);
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${da}`;
}

interface NoaaResponse {
  predictions?: { t: string; v: string; type?: "H" | "L" }[];
  error?: { message: string };
}

/**
 * Fetch hi/lo extrema for a 4-day window centered on `anchor` (yesterday → +2d)
 * so we always have a previous and next extremum around "now" and can find the
 * next high/low even near midnight.
 */
export async function fetchExtrema(
  stationId: string,
  anchor: Date,
  backDays = 1,
  fwdDays = 2,
): Promise<Extremum[]> {
  const begin = new Date(anchor);
  begin.setUTCDate(begin.getUTCDate() - backDays);
  const end = new Date(anchor);
  end.setUTCDate(end.getUTCDate() + fwdDays);

  const params = new URLSearchParams({
    begin_date: fmtDate(begin),
    end_date: fmtDate(end),
    station: stationId,
    product: "predictions",
    datum: "MLLW",
    time_zone: "lst_ldt",
    interval: "hilo",
    units: "english",
    format: "json",
    application: "obx-tides",
  });

  const res = await fetch(`${NOAA}?${params.toString()}`, {
    // Cache tide predictions for 15 min at the edge; they're deterministic.
    next: { revalidate: 900 },
  });
  if (!res.ok) {
    throw new Error(`NOAA request failed: ${res.status}`);
  }
  const data = (await res.json()) as NoaaResponse;
  if (data.error) {
    throw new Error(`NOAA: ${data.error.message}`);
  }
  if (!data.predictions?.length) {
    throw new Error("No tide predictions returned for this station.");
  }
  return data.predictions
    .filter((p) => p.type === "H" || p.type === "L")
    .map((p) => ({
      time: parseNoaaTime(p.t),
      height: parseFloat(p.v),
      type: p.type as "H" | "L",
    }))
    .filter((e) => Number.isFinite(e.time) && Number.isFinite(e.height))
    .sort((a, b) => a.time - b.time);
}

/**
 * Cosine interpolation between two consecutive extrema — the classic tidal
 * "rule of twelfths" smooth approximation.
 */
function interpHeight(prev: Extremum, next: Extremum, t: number): number {
  const span = next.time - prev.time;
  if (span <= 0) return prev.height;
  const frac = Math.min(1, Math.max(0, (t - prev.time) / span));
  // cosine ease from prev.height to next.height
  const c = (1 - Math.cos(frac * Math.PI)) / 2;
  return prev.height + (next.height - prev.height) * c;
}

/** Instantaneous rate (ft/hr) via analytic derivative of the cosine segment. */
function interpRate(prev: Extremum, next: Extremum, t: number): number {
  const spanMs = next.time - prev.time;
  if (spanMs <= 0) return 0;
  const frac = Math.min(1, Math.max(0, (t - prev.time) / spanMs));
  const spanHr = spanMs / 3_600_000;
  // d/dt of amp*(1-cos(pi*frac))/2 = amp * pi/2 * sin(pi*frac) / spanHr
  const amp = next.height - prev.height;
  return ((amp * Math.PI) / 2) * Math.sin(frac * Math.PI) / spanHr;
}

function bracket(extrema: Extremum[], t: number): [Extremum?, Extremum?] {
  let prev: Extremum | undefined;
  let next: Extremum | undefined;
  for (const e of extrema) {
    if (e.time <= t) prev = e;
    else {
      next = e;
      break;
    }
  }
  return [prev, next];
}

/** Build the full TideDay model from extrema, for the calendar day of `anchor`. */
export function buildTideDay(extrema: Extremum[], now: number): TideDay {
  // Local calendar day bounds (using our UTC-parsed convention).
  const nowDate = new Date(now);
  const dayStart = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
  );
  const dayEnd = dayStart + 24 * 3_600_000;

  // Sample the smooth curve every 10 minutes across the day.
  const curve: TidePoint[] = [];
  let dayMin = Infinity;
  let dayMax = -Infinity;
  for (let t = dayStart; t <= dayEnd; t += 10 * 60_000) {
    const [prev, next] = bracket(extrema, t);
    let h: number;
    if (prev && next) h = interpHeight(prev, next, t);
    else if (prev) h = prev.height;
    else if (next) h = next.height;
    else h = 0;
    curve.push({ time: t, height: h });
    if (h < dayMin) dayMin = h;
    if (h > dayMax) dayMax = h;
  }
  if (!Number.isFinite(dayMin)) dayMin = 0;
  if (!Number.isFinite(dayMax)) dayMax = 1;

  // Current conditions.
  const [prev, next] = bracket(extrema, now);
  let height: number;
  let rate: number;
  if (prev && next) {
    height = interpHeight(prev, next, now);
    rate = interpRate(prev, next, now);
  } else if (prev) {
    height = prev.height;
    rate = 0;
  } else if (next) {
    height = next.height;
    rate = 0;
  } else {
    height = 0;
    rate = 0;
  }

  const direction: Direction = rate >= 0 ? "rising" : "falling";

  // Slack detection: within 40 min of an extremum OR very low rate.
  const SLACK_MS = 40 * 60_000;
  const nearExtremum =
    (prev && Math.abs(now - prev.time) < SLACK_MS) ||
    (next && Math.abs(next.time - now) < SLACK_MS);
  let phase: Phase = direction;
  if (nearExtremum || Math.abs(rate) < 0.15) {
    // Which kind of slack? Use the closer extremum's type, or height vs midpoint.
    const mid = (dayMin + dayMax) / 2;
    phase = height >= mid ? "high-slack" : "low-slack";
  }

  const future = extrema.filter((e) => e.time > now);
  const nextHigh = future.find((e) => e.type === "H");
  const nextLow = future.find((e) => e.type === "L");

  const range = dayMax - dayMin || 1;
  const level = Math.min(1, Math.max(0, (height - dayMin) / range));

  return {
    extrema,
    curve,
    dayMin,
    dayMax,
    now: {
      height,
      rate,
      direction,
      phase,
      level,
      nextHigh,
      nextLow,
      prevExtremum: prev,
      nextExtremum: next,
    },
    computedFor: now,
  };
}
