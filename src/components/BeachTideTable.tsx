"use client";

import { useMemo, useSyncExternalStore } from "react";
import { buildBeachWeek, fmtFt, type BeachDay, type BeachWeek } from "@/lib/seo";
import type { Beach } from "@/lib/slugs";
import { latestExtrema, subscribeExtrema } from "@/lib/tide-feed";
import { fmtClock, startOfDay, stationNow, type Extremum } from "@/lib/tides";

const noSubscription = () => () => {};

/**
 * The beach page's tide table. The page is a static file, so the table in its
 * HTML is the one built with it (at most a day old; crawlers and readers
 * without JavaScript see that one). In the browser it is rebuilt for today
 * from the predictions the live chart above loads for the same beach, with no
 * request of its own; until they arrive, days already past are dropped.
 */
export default function BeachTideTable({
  beach,
  initialWeek,
  days,
}: {
  beach: Beach;
  initialWeek: BeachWeek | null;
  days: number;
}) {
  const live = useSyncExternalStore(
    subscribeExtrema,
    () => latestExtrema(beach.id),
    () => null,
  );
  // The station's day, read only in the browser: the server and the first
  // render in the browser both show the table as built.
  const today = useSyncExternalStore(
    noSubscription,
    () => startOfDay(stationNow()),
    () => null,
  );

  const week = useMemo(() => {
    if (live) return buildBeachWeek(live, beach, stationNow(), days);
    if (!initialWeek || today == null) return initialWeek;
    const remaining = initialWeek.days.filter((day) => day.dayStartMs >= today);
    return remaining.length > 0 ? { ...initialWeek, days: remaining } : null;
  }, [live, beach, days, initialWeek, today]);

  if (!week) {
    return (
      <p className="mt-2 rounded-2xl bg-coral-soft/40 p-3 font-body text-sm text-ink">
        The live tide table is temporarily unavailable — the interactive chart
        above has the latest NOAA predictions.
      </p>
    );
  }

  return (
    <>
      <TideTable days={week.days.slice(0, 7)} />
      {week.days.length > 7 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none rounded-2xl bg-shell/70 px-4 py-2.5 font-display text-sm font-semibold text-ocean-deep shadow-[var(--shadow-card)] active:scale-[0.99]">
            <span className="group-open:hidden">
              ▸ Show the full {week.days.length}-day tide forecast for {beach.label}
            </span>
            <span className="hidden group-open:inline">
              ▾ {beach.label} tide forecast — days 8–{week.days.length}
            </span>
          </summary>
          <TideTable days={week.days.slice(7)} />
        </details>
      )}
    </>
  );
}

function TideTable({ days }: { days: BeachDay[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-2xl bg-shell/70 shadow-[var(--shadow-card)]">
      <table className="w-full border-collapse font-body text-xs text-ink">
        <thead>
          <tr className="border-b border-ink/10 text-left font-display text-[11px] uppercase tracking-wide text-ink-soft">
            <th className="px-2 py-2">Day</th>
            <th className="px-2 py-2">High tides</th>
            <th className="px-2 py-2">Low tides</th>
            <th className="px-2 py-2">Sun</th>
            <th className="px-2 py-2">Moon</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.dayStartMs} className="border-b border-ink/5 align-top">
              <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{d.label}</td>
              <TideCell events={d.highs} />
              <TideCell events={d.lows} />
              <td className="px-2 py-1.5 whitespace-nowrap">
                ↑ {d.sunrise ?? "—"}
                <span className="block">↓ {d.sunset ?? "—"}</span>
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {d.moonEmoji} {d.moonName}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TideCell({ events }: { events: Extremum[] }) {
  if (!events.length) return <td className="px-2 py-1.5 text-ink-soft">—</td>;
  return (
    <td className="px-2 py-1.5">
      {events.map((e) => (
        <span key={e.time} className="block whitespace-nowrap">
          {fmtClock(e.time)}{" "}
          <span className="text-ink-soft">({fmtFt(e.height)} ft)</span>
        </span>
      ))}
    </td>
  );
}
