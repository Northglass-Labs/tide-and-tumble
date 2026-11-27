// Beach safety from the National Weather Service (api.weather.gov) — free,
// keyless, public-domain US government data. Two sources, because the useful
// signal is split across them:
//
//  1. /alerts/active — formal watches/warnings/statements (Rip Current
//     STATEMENT, Beach Hazards, Coastal Flood, High Surf, Tsunami). Only issued
//     in more severe/widespread cases.
//  2. The Surf Zone Forecast (SRF) text product — the DAILY rip-current RISK
//     level (Low/Moderate/High) that lifeguards fly their flags on, plus the UV
//     index. This is NOT in the alerts feed; a "Moderate rip current risk" that
//     closes beaches often has no formal alert at all. We parse the SRF segment
//     matching the beach's forecast zone.
//
// Everything is best-effort: any failure returns empty/null. Advisories are
// additive, never load-bearing.

import {
  fetchWithTimeout,
  readJsonBounded,
} from "./upstream";

const UA = "TideAndTumble/1.0 (tideandtumble.app, hello@northglass.io)";
const NWS_FETCH_TIMEOUT_MS = 4_000;
const NWS_JSON_MAX_BYTES = 768 * 1024;

export interface BeachAlert {
  id: string;
  event: string;
  severity: string;
  summary: string;
}

export type RiskLevel = "Low" | "Moderate" | "High";

export interface BeachSafety {
  /** Formal alerts + a synthesized rip-risk advisory when Moderate/High. */
  alerts: BeachAlert[];
  /** Today's rip current risk from the SRF, or null if none published here. */
  ripRisk: RiskLevel | null;
  /** Today's UV index category from the SRF (e.g. "Very High"), or null. */
  uvIndex: string | null;
  /** e.g. "NWS Wakefield (AKQ)" — attribution for whatever we found. */
  source: string | null;
  /**
   * What the office's Surf Zone Forecast says for this beach today: "today"
   * (a rip-current risk was read for it); "check" (today's forecast exists,
   * but no risk was read for this beach: the page links to it and claims
   * nothing, since no parser covers every office's format); "not-yet" (the
   * newest is from the last two days); "out-of-season" (none listed, or none
   * for longer); null when unknown.
   */
  ripForecast: "today" | "check" | "not-yet" | "out-of-season" | null;
  /** The office's Surf Zone Forecast page, for "check". */
  forecastUrl: string | null;
}

const EMPTY: BeachSafety = { alerts: [], ripRisk: null, uvIndex: null, source: null, ripForecast: null, forecastUrl: null };

/** A curated beach's NWS land forecast zone, its name, and the office that forecasts it (src/lib/beach-zones.json). */
export interface BeachZone {
  zone: string;
  office: string;
  name: string;
}

const LEVELS: RiskLevel[] = ["Low", "Moderate", "High"];
const level = (word: string) => (word[0]!.toUpperCase() + word.slice(1).toLowerCase()) as RiskLevel;

/**
 * Today's rip-current risk in a forecast section: the first "Rip Current
 * Risk" entry is today's. Most offices put the level on the same line; Boston
 * puts it on "<area>....Level" lines below, one per stretch of coast, and the
 * highest of them is the beach's.
 */
function todaysRipRisk(section: string): RiskLevel | null {
  const lines = section.split("\n");
  const at = lines.findIndex((line) => /^\s*Rip Current Risk\b(?!\s+Category)/i.test(line));
  if (at === -1) return null;
  const same = lines[at]!.match(/Rip Current Risk[*\s.]+(Low|Moderate|High)\b/i);
  if (same) return level(same[1]!);
  let highest = -1;
  for (const line of lines.slice(at + 1)) {
    const sub = line.match(/^\s+[A-Za-z][^.\n]*\.{2,}\s*(Low|Moderate|High)\b/i);
    if (!sub) break;
    highest = Math.max(highest, LEVELS.indexOf(level(sub[1]!)));
  }
  return highest === -1 ? null : LEVELS[highest]!;
}

/** The zone names a section's name lines give, after its UGC header and before its first blank line. */
function sectionNames(section: string): string {
  const header = section.search(/\d{6}-/);
  if (header === -1) return "";
  return (section.slice(header + 7).split(/\n\s*\n/)[0] ?? "").replace(/\s+/g, " ").toLowerCase();
}

const BEACH_EVENTS = [
  "rip current",
  "beach hazard",
  "high surf",
  "surf zone",
  "coastal flood",
  "sneaker wave",
  "tsunami",
];
const isBeachRelevant = (event: string) => {
  const normalized = event.toLowerCase();
  return BEACH_EVENTS.some((keyword) => normalized.includes(keyword));
};

/** Whether every NWS call a lookup made was answered. */
interface Outcome {
  failed: boolean;
}

async function nws<T = unknown>(
  url: string,
  signal: AbortSignal | undefined,
  outcome: Outcome,
): Promise<T | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: { "User-Agent": UA, Accept: "application/geo+json" },
        signal,
      },
      NWS_FETCH_TIMEOUT_MS,
    );
    if (!response.ok) {
      await response.body?.cancel();
      outcome.failed = true;
      return null;
    }
    return await readJsonBounded<T>(response, NWS_JSON_MAX_BYTES);
  } catch {
    outcome.failed = true;
    return null;
  }
}

interface PointProps {
  properties?: { gridId?: string; forecastZone?: string; timeZone?: string };
}

/** A moment's calendar date (YYYY-MM-DD) in an IANA time zone; New York's if the zone is not one. */
function localDate(ms: number, timeZone: string | null): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  try {
    return format(timeZone ?? "America/New_York");
  } catch {
    return format("America/New_York");
  }
}
interface AlertResp {
  features?: unknown;
}
interface ProductList {
  "@graph"?: unknown;
}

/**
 * The zone codes a section's header (its UGC line) names. NWS writes the
 * prefix once and carries it ("FLZ141-347-447-272100-" is FLZ141, FLZ347 and
 * FLZ447), writes ranges with ">" ("CAZ087>089-"), and ends with the
 * expiry time (six digits), which is not a zone.
 */
export function expandUgc(header: string): string[] {
  const zones: string[] = [];
  let prefix = "";
  for (const token of header.trim().split("-")) {
    const match = token.match(/^([A-Z]{2}[CZ])?(\d{3})(?:>(\d{3}))?$/);
    if (!match) continue;
    if (match[1]) prefix = match[1];
    if (!prefix) continue;
    const from = Number(match[2]);
    const to = match[3] ? Number(match[3]) : from;
    for (let code = from; code <= to && code - from < 200; code += 1) {
      zones.push(`${prefix}${String(code).padStart(3, "0")}`);
    }
  }
  return zones;
}

/** A section's UGC header: from its first zone code to the six-digit expiry, which may span lines. */
function sectionHeader(segment: string): string {
  const start = segment.search(/[A-Z]{2}[CZ]\d{3}/);
  if (start === -1) return "";
  const rest = segment.slice(start);
  const end = rest.search(/\d{6}-/);
  return end === -1 ? "" : rest.slice(0, end + 7).replace(/\s+/g, "");
}

/**
 * This beach's section of the office's Surf Zone Forecast, if the forecast
 * has one, and the rip-current risk and UV index it gives for today.
 */
export function parseSrf(
  text: string,
  zoneCode: string,
  zoneName?: string | null,
): { found: boolean; rip: RiskLevel | null; uv: string | null } {
  if (!/^[A-Z]{3}\d{3}$/.test(zoneCode)) {
    return { found: false, rip: null, uv: null };
  }
  // Sections are separated by "$$"; each starts with the zone codes it covers,
  // then their names. A section is the beach's by its code, or else by its
  // zone's name (offices sometimes keep an older code for the same coast).
  const sections = text.split("$$");
  const name = zoneName?.trim().toLowerCase();
  const seg =
    sections.find((segment) => expandUgc(sectionHeader(segment.toUpperCase())).includes(zoneCode)) ??
    (name ? sections.find((segment) => sectionNames(segment).includes(name)) : undefined);
  if (!seg) return { found: false, rip: null, uv: null };
  const uvM = seg.match(/UV Index[*\s.]+([A-Za-z][A-Za-z ]*?)\s*\./i);
  return { found: true, rip: todaysRipRisk(seg), uv: uvM ? uvM[1].trim() : null };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function forecastZoneCode(value: unknown): string | null {
  const raw = nonEmptyString(value);
  const code = raw?.split("/").pop()?.toUpperCase() ?? "";
  return /^[A-Z]{3}\d{3}$/.test(code) ? code : null;
}

function nwsProductUrl(value: unknown): string | null {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      url.hostname === "api.weather.gov" &&
      !url.port &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * The beach's safety data, and whether NWS answered every call it took. An
 * incomplete answer (a timeout, an error status) can be missing a warning, so
 * the API Worker never keeps one in its cache.
 */
export async function fetchBeachSafetyChecked(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  now: number = Date.now(),
  beach?: BeachZone,
): Promise<{ safety: BeachSafety; complete: boolean }> {
  const outcome: Outcome = { failed: false };
  const pt = `${lat.toFixed(4)},${lng.toFixed(4)}`;

  // Run the point lookup + formal alerts together.
  // A curated beach's land zone (src/lib/beach-zones.json): its point may be
  // on the water, where NWS gives a marine zone that carries no beach alerts.
  const zone = beach && /^[A-Z]{2}Z\d{3}$/.test(beach.zone) ? beach.zone : null;
  const [point, alertData, zoneAlertData] = await Promise.all([
    nws<PointProps>(`https://api.weather.gov/points/${pt}`, signal, outcome),
    nws<AlertResp>(
      `https://api.weather.gov/alerts/active?point=${pt}&status=actual`,
      signal,
      outcome,
    ),
    zone
      ? nws<AlertResp>(`https://api.weather.gov/alerts/active?zone=${zone}&status=actual`, signal, outcome)
      : Promise.resolve(null),
  ]);

  const alerts: BeachAlert[] = [];
  const seen = new Set<string>();
  const features = [
    ...(Array.isArray(alertData?.features) ? alertData.features : []),
    ...(Array.isArray(zoneAlertData?.features) ? zoneAlertData.features : []),
  ];
  for (const rawFeature of features) {
    const feature = record(rawFeature);
    const properties = record(feature?.properties);
    if (!feature || !properties) continue;
    const event = nonEmptyString(properties.event);
    if (!event) continue;
    if (!isBeachRelevant(event) || seen.has(event)) continue;
    seen.add(event);
    const description = nonEmptyString(properties.description) ?? "";
    const summary = description.replace(/\s+/g, " ").trim();
    alerts.push({
      id: nonEmptyString(feature.id) ?? event,
      event,
      severity: nonEmptyString(properties.severity) ?? "Unknown",
      summary: summary.split(/(?<=\.)\s/)[0]?.slice(0, 220) ?? "",
    });
  }

  const pointProperties = record(point?.properties);
  // A curated beach's own office: a pier point can fall in a neighboring office's area.
  const officeCandidate = (beach?.office ?? nonEmptyString(pointProperties?.gridId))?.toUpperCase();
  const office = officeCandidate && /^[A-Z]{3}$/.test(officeCandidate)
    ? officeCandidate
    : null;
  const zoneCode = zone ?? forecastZoneCode(pointProperties?.forecastZone);
  let ripRisk: RiskLevel | null = null;
  let uvIndex: string | null = null;
  let ripForecast: BeachSafety["ripForecast"] = null;

  if (office && zoneCode) {
    const list = await nws<ProductList>(
      `https://api.weather.gov/products/types/SRF/locations/${office}`,
      signal,
      outcome,
    );
    const graph = Array.isArray(list?.["@graph"]) ? list["@graph"] : [];
    const newest = record(graph[0]);
    const latest = nwsProductUrl(newest?.["@id"]);
    // NWS keeps about a week of forecasts, and an office that stops issuing
    // for the season leaves its last one listed: only a forecast issued on the
    // beach's own calendar day (its point's time zone) speaks for today.
    const issued = Date.parse(nonEmptyString(newest?.issuanceTime) ?? "");
    const zone = nonEmptyString(pointProperties?.timeZone);
    const today = Number.isFinite(issued) && localDate(issued, zone) >= localDate(now, zone);
    if (list && !newest) {
      ripForecast = "out-of-season";
    } else if (Number.isFinite(issued) && !today) {
      const daysOld = (Date.parse(localDate(now, zone)) - Date.parse(localDate(issued, zone))) / 86_400_000;
      ripForecast = daysOld <= 2 ? "not-yet" : "out-of-season";
    }
    if (latest && today) {
      const prod = await nws<{ productText?: unknown }>(latest, signal, outcome);
      const productText = nonEmptyString(prod?.productText);
      if (productText) {
        const parsed = parseSrf(productText, zoneCode, beach?.name);
        ripRisk = parsed.rip;
        uvIndex = parsed.uv;
        // A risk is stated only when one was read for this beach. Otherwise the
        // page links to today's forecast and claims nothing either way: no
        // parser covers every office's format, and a false "no risk" is the
        // one failure a beach-safety page must not have.
        ripForecast = ripRisk ? "today" : "check";
      }
    }
  }

  // Surface a Moderate/High rip risk as an advisory even without a formal alert.
  if ((ripRisk === "Moderate" || ripRisk === "High") && !seen.has("Rip Current Statement")) {
    alerts.unshift({
      id: "rip-risk",
      event: `${ripRisk} Rip Current Risk`,
      severity: ripRisk === "High" ? "Severe" : "Moderate",
      summary:
        ripRisk === "High"
          ? "Life-threatening rip currents are likely. Stay out of the surf; swim only near a lifeguard."
          : "Life-threatening rip currents are possible, especially near piers and jetties. Swim near a lifeguard.",
    });
  }

  const source = office ? `NWS (${office})` : alerts.length ? "NWS" : null;
  const forecastUrl = office ? `https://forecast.weather.gov/product.php?site=NWS&issuedby=${office}&product=SRF` : null;
  return { safety: { alerts, ripRisk, uvIndex, source, ripForecast, forecastUrl }, complete: !outcome.failed };
}

export async function fetchBeachSafety(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<BeachSafety> {
  return (await fetchBeachSafetyChecked(lat, lng, signal)).safety;
}

/** Back-compat helper: just the alert list (used by the client fetch shape). */
export async function fetchBeachAlerts(lat: number, lng: number): Promise<BeachAlert[]> {
  return (await fetchBeachSafety(lat, lng)).alerts;
}

export { EMPTY as EMPTY_SAFETY };
