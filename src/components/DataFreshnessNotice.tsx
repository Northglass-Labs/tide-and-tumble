export type SafetyStatus = "loading" | "fresh" | "stale" | "unavailable";

interface DataFreshnessNoticeProps {
  offline: boolean;
  safetyStatus: SafetyStatus;
  tideCachedAt: number | null;
}

export default function DataFreshnessNotice({
  offline,
  safetyStatus,
  tideCachedAt,
}: DataFreshnessNoticeProps) {
  const savedTime =
    tideCachedAt == null
      ? null
      : new Date(tideCachedAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });

  return (
    <>
      {/* The static page is this loading state; without JavaScript it never changes. */}
      <noscript>
        <p className="mx-5 mb-2 rounded-2xl border border-coral/40 bg-coral-soft/25 px-3.5 py-2 font-body text-xs text-ink">
          Beach warnings need JavaScript. Check the National Weather Service at weather.gov and the local lifeguards
          before entering the water.
        </p>
      </noscript>

      {safetyStatus === "loading" && !offline && (
        <p
          role="status"
          aria-live="polite"
          className="mx-5 mb-2 px-3.5 font-body text-xs text-ink-soft"
        >
          Checking NWS beach warnings…
        </p>
      )}

      {(offline || tideCachedAt != null) && (
        <div
          role="status"
          aria-live="polite"
          className="mx-5 mb-2 rounded-2xl border border-ocean/30 bg-ocean/10 px-3.5 py-2 font-body text-xs text-ink"
        >
          <p className="font-bold">Offline</p>
          <p className="mt-0.5 text-ink-soft">
            {savedTime
              ? `Showing saved tide predictions from ${savedTime}. Live marine and
                beach-safety data requires a connection.`
              : "Reconnect for live tide, marine, and beach-safety data."}
          </p>
        </div>
      )}

      {(safetyStatus === "stale" || safetyStatus === "unavailable") && (
        <div
          role="alert"
          className="mx-5 mb-2 rounded-2xl border border-coral/40 bg-coral-soft/25 px-3.5 py-2 font-body text-xs text-ink"
        >
          <p className="font-bold text-coral">
            {safetyStatus === "stale"
              ? "Beach safety data could not be refreshed."
              : "Beach safety data is unavailable."}
          </p>
          <p className="mt-0.5 text-ink-soft">
            Treat displayed advisories as outdated and check the NWS or a local
            lifeguard before entering the water.
          </p>
        </div>
      )}
    </>
  );
}
