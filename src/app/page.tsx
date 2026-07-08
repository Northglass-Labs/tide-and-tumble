"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTideDay,
  stationNow,
  startOfDay,
  fmtClock,
  fmtDayLabel,
  DAY_MS,
  type Extremum,
  type TideDay,
} from "@/lib/tides";
import {
  STATIONS,
  findStation,
  activeFromNoaa,
  type ActiveStation,
} from "@/lib/stations";
import type { Marine } from "@/lib/marine";
import { statusLine, phaseLabel, shellingHint } from "@/lib/copy";
import { sunTimes, moonPhase, moonTimes } from "@/lib/sun";
import TideHero from "@/components/TideHero";
import TideCurve from "@/components/TideCurve";
import BeachPicker from "@/components/BeachPicker";
import DayStrip from "@/components/DayStrip";
import AmbientToggle from "@/components/AmbientToggle";

const MAX_DAY_OFFSET = 30; // 30-day forward window

const DEFAULT_ID = "8651370"; // Corolla — where you are 🏖️
const LS_KEY = "obx-tides:station";

interface ApiResp {
  station: { id: string; label: string };
  extrema: Extremum[];
  error?: string;
}

/** Feet with a clean zero (never "-0.0"). */
function fmtFt(n: number): string {
  const s = n.toFixed(1);
  return s === "-0.0" ? "0.0" : s;
}

function fmtCountdown(fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `in ${m}m`;
  return `in ${h}h ${String(m).padStart(2, "0")}m`;
}

type Phase = "dawn" | "day" | "golden" | "dusk" | "night";
const PHASE_ORDER: Phase[] = ["dawn", "day", "golden", "dusk", "night"];
const PHASE_ICON: Record<Phase, string> = {
  dawn: "🌅",
  day: "☀️",
  golden: "🌇",
  dusk: "🌆",
  night: "🌙",
};

/** Which time-of-day phase we're in, from the station clock + today's sun times. */
function computePhase(
  nowMin: number,
  sunriseMin: number | null,
  sunsetMin: number | null,
): Phase {
  if (sunriseMin == null || sunsetMin == null) return "day";
  if (nowMin < sunriseMin - 50 || nowMin > sunsetMin + 75) return "night";
  if (nowMin < sunriseMin + 55) return "dawn";
  if (nowMin > sunsetMin + 12) return "dusk";
  if (nowMin > sunsetMin - 70) return "golden";
  return "day";
}

/** minutes-since-midnight for a "H:MM AM/PM" string */
function clockToMinutes(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

export default function Home() {
  const [station, setStation] = useState<ActiveStation>(
    () => findStation(DEFAULT_ID) ?? STATIONS[0],
  );
  const [extrema, setExtrema] = useState<Extremum[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => stationNow());
  const [dayOffset, setDayOffset] = useState(0);
  const [marine, setMarine] = useState<Marine | null>(null);
  const [theme, setTheme] = useState<Phase>("day");
  const [themeAuto, setThemeAuto] = useState(true);

  const selectStation = useCallback((s: ActiveStation) => {
    setStation(s);
    setDayOffset(0);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch {}
  }, []);

  // Restore last-picked beach, or auto-locate the nearest beach on first visit.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LS_KEY);
    } catch {}
    if (saved) {
      try {
        const s = JSON.parse(saved) as ActiveStation;
        if (s?.id && s?.label && Number.isFinite(s.lat)) {
          setStation(s);
          return;
        }
      } catch {}
    }
    // First visit → try to find the beach closest to the user automatically.
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const r = await fetch(
              `/api/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
            );
            const d = await r.json();
            if (r.ok && d.nearest) selectStation(activeFromNoaa(d.nearest));
          } catch {}
        },
        () => {},
        { timeout: 8000, maximumAge: 600_000 },
      );
    }
  }, [selectStation]);

  // Fetch tide extrema whenever the station changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tides?station=${encodeURIComponent(station.id)}`)
      .then(async (r) => {
        const data: ApiResp = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load tides");
        if (!cancelled) {
          setExtrema(data.extrema);
          setNowMs(stationNow());
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Something went wrong");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [station]);

  // Live marine conditions (surf / wind / water temp) for the selected beach.
  useEffect(() => {
    let cancelled = false;
    setMarine(null);
    fetch(
      `/api/marine?station=${encodeURIComponent(station.id)}&lat=${station.lat}&lng=${station.lng}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!cancelled && m) setMarine(m as Marine);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [station]);

  // Live clock: recompute "now" every 30s so the marker + creatures stay current.
  useEffect(() => {
    const id = setInterval(() => setNowMs(stationNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  const isToday = dayOffset === 0;
  const todayStartMs = useMemo(() => startOfDay(nowMs), [nowMs]);
  // Same time-of-day on the selected day (== now for today), so the hero preview
  // and creatures stay meaningful for any day.
  const focusMs = useMemo(() => nowMs + dayOffset * DAY_MS, [nowMs, dayOffset]);

  const day: TideDay | null = useMemo(
    () => (extrema ? buildTideDay(extrema, focusMs) : null),
    [extrema, focusMs],
  );

  // Sun/moon for the selected calendar day (noon UTC of that day, DST-safe).
  const sunMoonDate = useMemo(
    () => new Date(startOfDay(focusMs) + 12 * 60 * 60 * 1000),
    [focusMs],
  );
  const sun = useMemo(
    () => sunTimes(station.lat, station.lng, sunMoonDate),
    [station, sunMoonDate],
  );
  const moon = useMemo(() => moonPhase(sunMoonDate), [sunMoonDate]);
  const moonRS = useMemo(
    () => moonTimes(station.lat, station.lng, startOfDay(focusMs)),
    [station, focusMs],
  );

  // Auto time-of-day phase from the station clock + today's sun times.
  useEffect(() => {
    if (!themeAuto) return;
    const d = new Date(nowMs);
    const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    setTheme(
      computePhase(nowMin, clockToMinutes(sun.sunrise), clockToMinutes(sun.sunset)),
    );
  }, [nowMs, sun, themeAuto]);

  // Apply the phase to <html data-theme>.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const cycleTheme = () => {
    setThemeAuto(false);
    setTheme(
      (t) => PHASE_ORDER[(PHASE_ORDER.indexOf(t) + 1) % PHASE_ORDER.length],
    );
  };

  const stepDay = useCallback((dir: number) => {
    setDayOffset((o) => Math.min(MAX_DAY_OFFSET, Math.max(0, o + dir)));
  }, []);

  // Swipe the hero left/right to change days.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onHeroPointerDown = (e: React.PointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };
  const onHeroPointerUp = (e: React.PointerEvent) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      stepDay(dx < 0 ? 1 : -1); // swipe left → next day
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h1 className="font-brand text-2xl leading-none text-ocean-deep">
              Tide &amp; Tumble
            </h1>
            <p className="mt-1 font-body text-xs text-ink-soft">
              Beach tides, alive
            </p>
          </div>
          <button
            onClick={cycleTheme}
            className="grid h-10 w-10 place-items-center rounded-full bg-shell/70 text-lg shadow-[var(--shadow-float)] active:scale-95"
            aria-label="Change time of day"
            title="Change time of day"
          >
            {PHASE_ICON[theme]}
          </button>
        </header>

        {/* Beach selector */}
        <button
          onClick={() => setPickerOpen(true)}
          className="mx-5 mb-1 flex items-center justify-between rounded-2xl bg-shell/70 px-4 py-2.5 shadow-[var(--shadow-float)] active:scale-[0.99]"
        >
          <span className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            🏖️ {station.label}
          </span>
          <span className="font-body text-sm text-ocean">change ›</span>
        </button>
        <p className="mb-2 px-6 font-body text-[11px] text-ink-soft/80">
          {station.stationName}
          {station.note ? ` · ${station.note}` : ""}
        </p>

        {/* Day switcher (30-day window) */}
        <DayStrip
          todayStartMs={todayStartMs}
          offset={dayOffset}
          onSelect={setDayOffset}
          maxDays={MAX_DAY_OFFSET}
        />

        {/* Hero */}
        {loading && !day && (
          <div className="grid h-72 place-items-center rounded-b-[2.5rem] bg-sky-top/60">
            <div className="animate-pulse font-body text-ink-soft">
              Reading the tide…
            </div>
          </div>
        )}
        {error && (
          <div className="mx-5 rounded-2xl bg-coral-soft/40 p-4 text-center font-body text-ink">
            <p className="font-bold">Couldn&apos;t load tides</p>
            <p className="text-sm text-ink-soft">{error}</p>
            <button
              onClick={() => setStation({ ...station })}
              className="mt-2 rounded-xl bg-coral px-4 py-2 text-sm font-bold text-white"
            >
              Try again
            </button>
          </div>
        )}
        {day && (
          <div
            className="relative select-none"
            style={{ touchAction: "pan-y" }}
            onPointerDown={onHeroPointerDown}
            onPointerUp={onHeroPointerUp}
          >
            <TideHero now={day.now} />
            {/* swipe affordances */}
            {dayOffset > 0 && (
              <button
                onClick={() => stepDay(-1)}
                aria-label="Previous day"
                className="absolute left-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-shell/60 text-ink-soft backdrop-blur-sm transition active:scale-90"
              >
                ‹
              </button>
            )}
            {dayOffset < MAX_DAY_OFFSET && (
              <button
                onClick={() => stepDay(1)}
                aria-label="Next day"
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-shell/60 text-ink-soft backdrop-blur-sm transition active:scale-90"
              >
                ›
              </button>
            )}
          </div>
        )}

        {/* Status */}
        {day && (
          <section className="px-5 pt-5">
            {!isToday && (
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full bg-ocean/10 px-3 py-1 font-body text-xs font-bold text-ocean-deep">
                  Preview · {fmtDayLabel(focusMs)} at {fmtClock(focusMs)}
                </span>
                <button
                  onClick={() => setDayOffset(0)}
                  className="rounded-full bg-coral px-3 py-1 font-body text-xs font-bold text-white active:scale-95"
                >
                  ↺ Today
                </button>
              </div>
            )}
            <p className="font-display text-2xl font-semibold leading-tight text-ink">
              {statusLine(day.now, focusMs)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip>
                {day.now.direction === "rising" ? "↑" : "↓"}{" "}
                {phaseLabel(day.now.phase)}
              </Chip>
              <Chip>{fmtFt(day.now.height)} ft</Chip>
              <Chip>
                {Math.abs(day.now.rate) < 0.05
                  ? "±0.0"
                  : `${day.now.rate > 0 ? "+" : "−"}${Math.abs(
                      day.now.rate,
                    ).toFixed(1)}`}{" "}
                ft/hr
              </Chip>
            </div>
            {shellingHint(day.now) && (
              <p className="mt-2 font-body text-sm text-ocean">
                {shellingHint(day.now)}
              </p>
            )}
          </section>
        )}

        {/* Next high / low */}
        {day && (
          <section className="grid grid-cols-2 gap-3 px-5 pt-4">
            <TideCard
              label={isToday ? "Next high" : "High tide"}
              arrow="▲"
              when={day.now.nextHigh ? fmtClock(day.now.nextHigh.time) : "—"}
              sub={
                day.now.nextHigh
                  ? `${fmtFt(day.now.nextHigh.height)} ft${
                      isToday
                        ? ` · ${fmtCountdown(focusMs, day.now.nextHigh.time)}`
                        : ""
                    }`
                  : ""
              }
              accent="ocean"
            />
            <TideCard
              label={isToday ? "Next low" : "Low tide"}
              arrow="▼"
              when={day.now.nextLow ? fmtClock(day.now.nextLow.time) : "—"}
              sub={
                day.now.nextLow
                  ? `${fmtFt(day.now.nextLow.height)} ft${
                      isToday
                        ? ` · ${fmtCountdown(focusMs, day.now.nextLow.time)}`
                        : ""
                    }`
                  : ""
              }
              accent="coral"
            />
          </section>
        )}

        {/* Curve */}
        {day && (
          <section className="mx-5 mt-5 rounded-3xl bg-shell/70 p-4 shadow-[var(--shadow-card)]">
            <h2 className="mb-1 font-display text-sm font-semibold text-ink-soft">
              {isToday ? "Today's tide" : `${fmtDayLabel(focusMs)} tide`}
            </h2>
            <TideCurve day={day} />
          </section>
        )}

        {/* Conditions: marine (today only) + sun & moon */}
        {day && (
          <section className="mx-5 mt-4 mb-8 rounded-3xl bg-shell/60 p-4">
            {isToday && marine && (marine.waterTempF != null || marine.windMph != null || marine.surfFt != null) && (
              <div className="mb-3 grid grid-cols-3 gap-2">
                <Stat
                  icon="🌡️"
                  label="Water"
                  value={marine.waterTempF != null ? `${Math.round(marine.waterTempF)}°F` : "—"}
                />
                <Stat
                  icon="💨"
                  label="Wind"
                  value={
                    marine.windMph != null
                      ? `${Math.round(marine.windMph)}${marine.windDir ? " " + marine.windDir : ""}`
                      : "—"
                  }
                  hint={marine.windMph != null ? "mph" : undefined}
                />
                <Stat
                  icon="🌊"
                  label="Surf"
                  value={marine.surfFt != null ? `${marine.surfFt.toFixed(1)} ft` : "—"}
                  hint={
                    marine.surfFt != null && marine.surfPeriodS != null
                      ? `@ ${Math.round(marine.surfPeriodS)}s`
                      : undefined
                  }
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-body text-sm text-ink-soft">
              <span>🌅 Sunrise · {sun.sunrise ?? "—"}</span>
              <span>🌇 Sunset · {sun.sunset ?? "—"}</span>
              <span>🌙 Moonrise · {moonRS.rise ?? (moonRS.alwaysUp ? "up all day" : "—")}</span>
              <span>🌘 Moonset · {moonRS.set ?? (moonRS.alwaysDown ? "down all day" : "—")}</span>
              <span className="col-span-2 mt-0.5 flex items-center gap-1.5 text-ink-soft/90">
                <span className="text-base">{moon.emoji}</span>
                {moon.name} · {Math.round(moon.illumination * 100)}% lit
              </span>
            </div>
            {isToday && marine?.source && (
              <p className="mt-2 text-[10px] text-ink-soft/60">
                Conditions: {marine.source}
              </p>
            )}
            <p className="mt-1 text-[10px] text-ink-soft/50">
              Art: Microsoft Fluent Emoji (MIT) · animated Google Noto Emoji (Apache-2.0)
            </p>
          </section>
        )}

        <BeachPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          currentId={station.id}
          onSelect={selectStation}
        />
        <AmbientToggle />
      </main>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-sky-bottom/60 px-2 py-2.5 text-center">
      <span className="text-lg leading-none">{icon}</span>
      <span className="mt-1 font-display text-base font-bold leading-tight text-ink">
        {value}
      </span>
      <span className="text-[10px] text-ink-soft">{hint ?? label}</span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-shell/80 px-3 py-1 font-body text-sm font-bold text-ocean-deep shadow-sm">
      {children}
    </span>
  );
}

function TideCard({
  label,
  arrow,
  when,
  sub,
  accent,
}: {
  label: string;
  arrow: string;
  when: string;
  sub: string;
  accent: "ocean" | "coral";
}) {
  return (
    <div className="rounded-3xl bg-shell/70 p-4 shadow-[var(--shadow-card)]">
      <p className="font-body text-xs font-bold uppercase tracking-wide text-ink-soft">
        <span className={accent === "ocean" ? "text-ocean" : "text-coral"}>
          {arrow}
        </span>{" "}
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold text-ink">{when}</p>
      <p className="font-body text-xs text-ink-soft">{sub}</p>
    </div>
  );
}
