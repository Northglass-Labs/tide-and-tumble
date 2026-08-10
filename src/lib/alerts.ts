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

const UA = "TideAndTumble/1.0 (tideandtumble.app, hello@northglass.io)";

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
const isBeachRelevant = (e: string) =>
  BEACH_EVENTS.some((k) => e.toLowerCase().includes(k));

async function nws<T = unknown>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
      next: { revalidate: 900 },
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

interface PointProps {
  properties?: { gridId?: string; forecastZone?: string };
}
interface AlertResp {
  features?: { id?: string; properties?: Record<string, string | null> }[];
}
interface ProductList {
  "@graph"?: { "@id"?: string }[];
}

/** Extract this beach's rip-current risk + UV from the office SRF text product. */
function parseSrf(text: string, zoneCode: string): { rip: RiskLevel | null; uv: string | null } {
  // Segments are separated by "$$"; each starts with its UGC zone code(s).
  const segments = text.split("$$");
  const seg =
    segments.find((s) => s.includes(zoneCode)) ??
    // fall back to the first segment carrying a rip-current headline
    segments.find((s) => /RIP CURRENT RISK/i.test(s));
  if (!seg) return { rip: null, uv: null };
  // First occurrence in the segment == today's period.
  const ripM = seg.match(/Rip Current Risk[*\s.]+(Low|Moderate|High)/i);
  const uvM = seg.match(/UV Index[*\s.]+([A-Za-z][A-Za-z ]*?)\s*\./i);
  const rip = ripM
    ? ((ripM[1][0].toUpperCase() + ripM[1].slice(1).toLowerCase()) as RiskLevel)
    : null;
  return { rip, uv: uvM ? uvM[1].trim() : null };
}

export async function fetchBeachSafety(lat: number, lng: number): Promise<BeachSafety> {
  const pt = `${lat.toFixed(4)},${lng.toFixed(4)}`;

  // Run the point lookup + formal alerts together.
  const [point, alertData] = await Promise.all([
    nws<PointProps>(`https://api.weather.gov/points/${pt}`),
    nws<AlertResp>(`https://api.weather.gov/alerts/active?point=${pt}&status=actual`),
  ]);

  const alerts: BeachAlert[] = [];
  const seen = new Set<string>();
  for (const f of alertData?.features ?? []) {
    const p = f.properties ?? {};
    const event = (p.event as string) ?? "";
    if (!isBeachRelevant(event) || seen.has(event)) continue;
    seen.add(event);
    const desc = ((p.description as string) ?? "").replace(/\s+/g, " ").trim();
    alerts.push({
      id: f.id ?? event,
      event,
      severity: (p.severity as string) ?? "Unknown",
      summary: desc.split(/(?<=\.)\s/)[0]?.slice(0, 220) ?? "",
    });
  }

  const office = point?.properties?.gridId;
  const zoneCode = point?.properties?.forecastZone?.split("/").pop() ?? "";
  let ripRisk: RiskLevel | null = null;
  let uvIndex: string | null = null;

  if (office) {
    const list = await nws<ProductList>(
      `https://api.weather.gov/products/types/SRF/locations/${office}`,
    );
    const latest = list?.["@graph"]?.[0]?.["@id"];
    if (latest) {
      const prod = await nws<{ productText?: string }>(latest);
      if (prod?.productText) {
        const parsed = parseSrf(prod.productText, zoneCode);
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
