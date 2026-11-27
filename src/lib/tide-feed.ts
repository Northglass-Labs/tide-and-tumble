// The tide predictions the live chart has loaded, by station id, for anything
// else on the page that shows the same station (the beach page's table). One
// request serves both; nothing here makes a request of its own.

import type { Extremum } from "./tides";

type Listener = () => void;

const latest = new Map<string, Extremum[]>();
const listeners = new Set<Listener>();

/** Records the predictions loaded for a station and tells the subscribers. */
export function publishExtrema(stationId: string, extrema: Extremum[]): void {
  latest.set(stationId, extrema);
  for (const listener of listeners) listener();
}

/** The predictions last loaded for a station, or null before any were. */
export function latestExtrema(stationId: string): Extremum[] | null {
  return latest.get(stationId) ?? null;
}

/** For `useSyncExternalStore`: returns the unsubscribe function. */
export function subscribeExtrema(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
