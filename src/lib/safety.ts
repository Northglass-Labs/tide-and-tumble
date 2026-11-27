// Reading the API's beach-safety answer in the browser. A rip-current warning
// must never silently become "none": unless the answer says NWS answered in
// full (`complete: true`), the page says the safety data is unavailable, and
// still shows whatever warnings did arrive.

import type { BeachAlert } from "./alerts";

export interface SafetyReading {
  alerts: BeachAlert[];
  uvIndex: string | null;
  /** What to say when NWS has no rip-current forecast for today, or null. */
  ripNote: { text: string; href: string | null } | null;
  /** "fresh" only for a complete answer; anything else is "unavailable". */
  status: "fresh" | "unavailable";
}

const isAlert = (value: unknown): value is BeachAlert =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as BeachAlert).event === "string" &&
  typeof (value as BeachAlert).id === "string";

/**
 * What the page says about rip currents when no advisory does: a Moderate or
 * High risk is an advisory already, so silence never stands for a forecast.
 */
function ripNote(forecast: unknown, risk: unknown, url: unknown): { text: string; href: string | null } | null {
  const text = (line: string) => ({ text: line, href: null });
  if (forecast === "today" && risk === "Low") return text("Low rip current risk today (NWS)");
  if (forecast === "check") {
    // Today's forecast exists, but no risk was read for this beach: no claim either way.
    const href = typeof url === "string" && url.startsWith("https://forecast.weather.gov/") ? url : null;
    return { text: "Check today's NWS surf zone forecast for rip-current risk", href };
  }
  if (forecast === "not-yet") return text("No NWS rip-current forecast for today yet.");
  if (forecast === "out-of-season") return text("No NWS rip-current forecasts are being issued here this season.");
  return null;
}

export function readSafety(body: unknown): SafetyReading {
  const answer = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  return {
    alerts: Array.isArray(answer.alerts) ? answer.alerts.filter(isAlert) : [],
    uvIndex: typeof answer.uvIndex === "string" ? answer.uvIndex : null,
    ripNote: answer.complete === true ? ripNote(answer.ripForecast, answer.ripRisk, answer.forecastUrl) : null,
    status: answer.complete === true ? "fresh" : "unavailable",
  };
}
