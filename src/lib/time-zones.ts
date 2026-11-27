// Each station's IANA time zone. Tide predictions are asked for in UTC and read
// in this zone, as are "now", day boundaries and sun and moon times. (NOAA's
// own local frame, lst_ldt, disagrees with the real zone at about 130
// stations, so it is not used.) By state where NOAA gives one; Florida west of about 85.4°W
// (the panhandle) is on Central time. Stations with no state are placed by
// their coordinates, and outside the US by a fixed offset from longitude.

const BY_STATE: Record<string, string> = {
  AL: "America/Chicago",
  MS: "America/Chicago",
  LA: "America/Chicago",
  TX: "America/Chicago",
  CA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  WA: "America/Los_Angeles",
  HI: "Pacific/Honolulu",
  PR: "America/Puerto_Rico",
  VI: "America/St_Thomas",
  GU: "Pacific/Guam",
  AS: "Pacific/Pago_Pago",
};

/** Eastern-time states on the Atlantic coast. */
const EASTERN = new Set(["ME", "NH", "MA", "RI", "CT", "NY", "NJ", "PA", "DE", "MD", "DC", "VA", "NC", "SC", "GA"]);

/** Florida's panhandle west of about 85.4°W keeps Central time. */
const FLORIDA_CENTRAL_WEST_OF = -85.4;

/** The Aleutians west of 169.5°W keep Hawaii-Aleutian time. */
const ALEUTIAN_WEST_OF = -169.5;

function alaska(lng: number): string {
  return lng < ALEUTIAN_WEST_OF || lng > 0 ? "America/Adak" : "America/Anchorage";
}

/** A station with no state, placed by its coordinates. */
function byCoordinates(lat: number, lng: number): string {
  if (lat > 50 && (lng < ALEUTIAN_WEST_OF || lng > 165)) return "America/Adak";
  if (lat > 54 && lng < -129.5) return "America/Anchorage";
  if (lat > 32 && lat < 55 && lng >= -130 && lng < -116.5) return "America/Los_Angeles";
  if (lat > 18 && lat < 23 && lng >= -161 && lng < -154) return "Pacific/Honolulu";
  if (lat > 17.5 && lat < 18.6 && lng >= -68 && lng < -64.5) return "America/Puerto_Rico";
  if (lat > 13 && lat < 21 && lng >= 144 && lng < 146.5) return "Pacific/Guam";
  if (lat > 18 && lat < 20.5 && lng >= 166 && lng < 167.5) return "Pacific/Wake";
  if (lat > 4 && lat < 15 && lng >= 160 && lng < 173) return "Pacific/Kwajalein";
  if (lat > -21.5 && lat < -12 && (lng >= 176 || lng < -178)) return "Pacific/Fiji";
  if (lat > -15 && lat < -13 && lng >= -171 && lng < -168) return "Pacific/Pago_Pago";
  if (lat > 24 && lat < 45 && lng >= -97.6 && lng < FLORIDA_CENTRAL_WEST_OF) return "America/Chicago";
  if (lat > 24 && lat < 47.5 && lng >= FLORIDA_CENTRAL_WEST_OF && lng < -66.5) return "America/New_York";
  // Elsewhere, a fixed offset from longitude (no daylight saving): Etc/GMT signs are reversed.
  const hours = Math.max(-12, Math.min(14, Math.round(lng / 15)));
  return hours === 0 ? "Etc/GMT" : `Etc/GMT${hours > 0 ? "-" : "+"}${Math.abs(hours)}`;
}

/** The station's IANA time zone, from its state where known, otherwise from its coordinates. */
export function stationTimeZone(station: { lat: number; lng: number; state?: string }): string {
  const state = station.state?.toUpperCase() ?? "";
  if (state === "FL") return station.lng < FLORIDA_CENTRAL_WEST_OF ? "America/Chicago" : "America/New_York";
  if (state === "AK") return alaska(station.lng);
  if (EASTERN.has(state)) return "America/New_York";
  return BY_STATE[state] ?? byCoordinates(station.lat, station.lng);
}
