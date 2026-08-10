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
}

const EMPTY: BeachSafety = { alerts: [], ripRisk: null, uvIndex: null, source: null };

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

async function nws<T = unknown>(
  url: string,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: { "User-Agent": UA, Accept: "application/geo+json" },
        next: { revalidate: 900 },
        signal,
      },
      NWS_FETCH_TIMEOUT_MS,
    );
    return response.ok
      ? await readJsonBounded<T>(response, NWS_JSON_MAX_BYTES)
      : null;
  } catch {
    return null;
  }
}

interface PointProps {
  properties?: { gridId?: string; forecastZone?: string };
}
interface AlertResp {
  features?: unknown;
}
interface ProductList {
  "@graph"?: unknown;
}

/** Extract this beach's rip-current risk + UV from the office SRF text product. */
function parseSrf(text: string, zoneCode: string): { rip: RiskLevel | null; uv: string | null } {
  if (!/^[A-Z]{3}\d{3}$/.test(zoneCode)) {
    return { rip: null, uv: null };
  }
  // Segments are separated by "$$"; each starts with its UGC zone code(s).
  const segments = text.split("$$");
  const zonePattern = new RegExp(`\\b${zoneCode}\\b`);
  const seg = segments.find((segment) =>
    zonePattern.test(segment.slice(0, 600).toUpperCase()),
  );
  if (!seg) return { rip: null, uv: null };
  // First occurrence in the segment == today's period.
  const ripM = seg.match(/Rip Current Risk[*\s.]+(Low|Moderate|High)/i);
  const uvM = seg.match(/UV Index[*\s.]+([A-Za-z][A-Za-z ]*?)\s*\./i);
  const rip = ripM
    ? ((ripM[1][0].toUpperCase() + ripM[1].slice(1).toLowerCase()) as RiskLevel)
    : null;
  return { rip, uv: uvM ? uvM[1].trim() : null };
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

export async function fetchBeachSafety(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<BeachSafety> {
  const pt = `${lat.toFixed(4)},${lng.toFixed(4)}`;

  // Run the point lookup + formal alerts together.
  const [point, alertData] = await Promise.all([
    nws<PointProps>(`https://api.weather.gov/points/${pt}`, signal),
    nws<AlertResp>(
      `https://api.weather.gov/alerts/active?point=${pt}&status=actual`,
      signal,
    ),
  ]);

  const alerts: BeachAlert[] = [];
  const seen = new Set<string>();
  const features = Array.isArray(alertData?.features) ? alertData.features : [];
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
  const officeCandidate = nonEmptyString(pointProperties?.gridId)?.toUpperCase();
  const office = officeCandidate && /^[A-Z]{3}$/.test(officeCandidate)
    ? officeCandidate
    : null;
  const zoneCode = forecastZoneCode(pointProperties?.forecastZone);
  let ripRisk: RiskLevel | null = null;
  let uvIndex: string | null = null;

  if (office && zoneCode) {
    const list = await nws<ProductList>(
      `https://api.weather.gov/products/types/SRF/locations/${office}`,
      signal,
    );
    const graph = Array.isArray(list?.["@graph"]) ? list["@graph"] : [];
    const latest = nwsProductUrl(record(graph[0])?.["@id"]);
    if (latest) {
      const prod = await nws<{ productText?: unknown }>(latest, signal);
      const productText = nonEmptyString(prod?.productText);
      if (productText) {
        const parsed = parseSrf(productText, zoneCode);
        ripRisk = parsed.rip;
        uvIndex = parsed.uv;
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
  return { alerts, ripRisk, uvIndex, source };
}

/** Back-compat helper: just the alert list (used by the client fetch shape). */
export async function fetchBeachAlerts(lat: number, lng: number): Promise<BeachAlert[]> {
  return (await fetchBeachSafety(lat, lng)).alerts;
}

export { EMPTY as EMPTY_SAFETY };
