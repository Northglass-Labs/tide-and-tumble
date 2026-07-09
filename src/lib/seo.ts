// Server-side builders for the SEO beach pages: the 7-day tide table model,
// the location-specific intro paragraph, and data-driven FAQ copy.
// Everything here runs at SSG/ISR time (no client code).

import {
  fetchExtrema,
  buildTideDay,
  stationNow,
  startOfDay,
  fmtClock,
  fmtDayLabel,
  DAY_MS,
  type Extremum,
  type TideNow,
} from "./tides";
import { sunTimes, moonPhase, moonTimes } from "./sun";
import type { Beach } from "./slugs";
import type { Exposure } from "./stations";
import { noaaId } from "./stations";

export interface BeachDay {
  dayStartMs: number;
  /** e.g. "Wed, Jul 9" */
  label: string;
  highs: Extremum[];
  lows: Extremum[];
  sunrise: string | null;
  sunset: string | null;
  moonrise: string | null;
  moonset: string | null;
  moonEmoji: string;
  moonName: string;
}

export interface BeachWeek {
  days: BeachDay[];
  now: TideNow;
  /** ms the model was computed for (station wall clock) */
  computedFor: number;
  /** min/max across the whole week, ft MLLW */
  weekMin: number;
  weekMax: number;
}

/**
 * Fetch NOAA extrema and shape them into a 7-day, server-renderable table model.
 * Throws on NOAA failure — caller decides the fallback rendering.
 */
export async function fetchBeachWeek(beach: Beach, days = 7): Promise<BeachWeek> {
  const extrema = await fetchExtrema(noaaId(beach), new Date(), 1, days + 1);
  const nowMs = stationNow();
  const todayStart = startOfDay(nowMs);

  const out: BeachDay[] = [];
  let weekMin = Infinity;
  let weekMax = -Infinity;

  for (let i = 0; i < days; i++) {
    const dayStart = todayStart + i * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const inDay = extrema.filter((e) => e.time >= dayStart && e.time < dayEnd);
    for (const e of inDay) {
      if (e.height < weekMin) weekMin = e.height;
      if (e.height > weekMax) weekMax = e.height;
    }
    const noon = new Date(dayStart + 12 * 3_600_000);
    const sun = sunTimes(beach.lat, beach.lng, noon);
    const moonRS = moonTimes(beach.lat, beach.lng, dayStart);
    const moon = moonPhase(noon);
    out.push({
      dayStartMs: dayStart,
      label: fmtDayLabel(dayStart + 12 * 3_600_000),
      highs: inDay.filter((e) => e.type === "H"),
      lows: inDay.filter((e) => e.type === "L"),
      sunrise: sun.sunrise,
      sunset: sun.sunset,
      moonrise: moonRS.rise ?? (moonRS.alwaysUp ? "up all day" : null),
      moonset: moonRS.set ?? (moonRS.alwaysDown ? "down all day" : null),
      moonEmoji: moon.emoji,
      moonName: moon.name,
    });
  }
  if (!Number.isFinite(weekMin)) weekMin = 0;
  if (!Number.isFinite(weekMax)) weekMax = 0;

  const model = buildTideDay(extrema, nowMs);
  return { days: out, now: model.now, computedFor: nowMs, weekMin, weekMax };
}

/** Feet with a clean zero (never "-0.0"). */
export function fmtFt(n: number): string {
  const s = n.toFixed(1);
  return s === "-0.0" ? "0.0" : s;
}

const EXPOSURE_COPY: Record<Exposure, string> = {
  ocean:
    "an open-ocean beach, so the tide here is the surf-side tide — the one that matters for swimming, surfing, shelling, and how much dry sand you get",
  inlet:
    "an inlet station, where tides run strong and boaters and anglers time their day around the current as much as the height",
  sound:
    "on the sound side, where tides are gentler and wind-driven — expect smaller ranges than the ocean beaches across the island",
  bay: "a river/bay station, where the tide arrives later and gentler than on the open coast",
};

/** ~120-word location-specific intro assembled from real station facts. */
export function beachIntro(beach: Beach, week: BeachWeek | null): string {
  const range =
    week && week.weekMax > week.weekMin
      ? ` Tides here swing between about ${fmtFt(week.weekMin)} ft and ${fmtFt(week.weekMax)} ft (MLLW) over the next ${week.days.length} days.`
      : "";
  const tableSpan =
    week && week.days.length > 7 ? `${week.days.length}-day tide forecast` : "seven days of highs and lows";
  const src =
    beach.type === "R"
      ? "a harmonic NOAA reference station, so predictions come straight from its own published constituents"
      : "a NOAA subordinate station, so highs and lows are offset from a nearby reference gauge";
  return (
    `${beach.label}, ${beach.state} sits in the ${beach.region} region. ` +
    `Its tide predictions come from the ${beach.stationName} station (NOAA ${noaaId(beach)}), ${src}. ` +
    `This spot is ${EXPOSURE_COPY[beach.exposure]}.${range} ` +
    `The chart above is live, and the ${tableSpan} below lists every high and low with heights, ` +
    `plus sunrise, sunset, and the moon — everything you need to time a beach day, a surf session, or a low-tide walk.`
  );
}

export interface FaqItem {
  q: string;
  a: string;
}

function listTimes(events: Extremum[]): string {
  if (!events.length) return "—";
  return events
    .map((e) => `${fmtClock(e.time)} (${fmtFt(e.height)} ft)`)
    .join(" and ");
}

/** Data-driven FAQ copy (rendered as plain content — no FAQPage schema on purpose). */
export function beachFaq(beach: Beach, week: BeachWeek | null): FaqItem[] {
  const today = week?.days[0];
  const faqs: FaqItem[] = [];

  if (today) {
    faqs.push({
      q: `What time is high tide in ${beach.label} today?`,
      a: `High tide in ${beach.label}, ${beach.state} today (${today.label}) is at ${listTimes(today.highs)}, based on NOAA predictions for ${beach.stationName}.`,
    });
    faqs.push({
      q: `What time is low tide in ${beach.label} today?`,
      a: `Low tide today is at ${listTimes(today.lows)}. Low tide is the best window for shelling, tide pools, and wide-beach walks.`,
    });
  }
  faqs.push({
    q: `Is the tide coming in or going out in ${beach.label} right now?`,
    a: `The live chart at the top of this page shows the current direction — chevrons flow shoreward when the tide is coming in and seaward when it's going out, with the live rate in ft/hr. Tides here reverse roughly every six hours.`,
  });
  if (week && week.weekMax > week.weekMin) {
    faqs.push({
      q: `How big are the tides in ${beach.label}?`,
      a: `Over the next ${week.days.length} days, ${beach.label} ranges from about ${fmtFt(week.weekMin)} ft at the lowest lows to ${fmtFt(week.weekMax)} ft at the highest highs (MLLW datum). ${
        today ? `The moon is currently ${today.moonName.toLowerCase()} — tides run largest near full and new moons (spring tides) and smallest near the quarters (neap tides).` : ""
      }`,
    });
  }
  faqs.push({
    q: `Where does this tide data come from?`,
    a: `Predictions are published by NOAA CO-OPS for the ${beach.stationName} station (ID ${noaaId(beach)}), refreshed continuously. Heights are in feet above MLLW (mean lower low water). Predictions are not suitable for navigation.`,
  });
  return faqs;
}
