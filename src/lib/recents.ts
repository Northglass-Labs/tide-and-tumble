// Recently-viewed beaches, in localStorage. Client-only, best-effort (never
// throws — private mode / disabled storage just yields an empty list).

import type { ActiveStation } from "./stations";

const KEY = "tnt:recent-beaches";
const MAX = 6;

export function getRecents(): ActiveStation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as ActiveStation[];
    return Array.isArray(list)
      ? list.filter((s) => s?.id && s?.label && Number.isFinite(s.lat)).slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(station: ActiveStation): void {
  try {
    const slim: ActiveStation = {
      id: station.id,
      label: station.label,
      stationName: station.stationName,
      lat: station.lat,
      lng: station.lng,
      exposure: station.exposure,
      note: station.note,
      region: station.region,
    };
    const next = [slim, ...getRecents().filter((s) => s.id !== slim.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — fine, recents are a convenience only
  }
}
