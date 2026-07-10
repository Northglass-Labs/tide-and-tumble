"use client";

import { useEffect, useRef } from "react";
import { DAY_MS, dayParts } from "@/lib/tides";
import { moonPhase } from "@/lib/sun";

/**
 * A horizontally scrollable strip of day chips (Today → +maxDays), weather-app
 * style, plus a calendar chip that opens the platform's native date picker.
 * Tapping a chip selects that day; the selected chip auto-scrolls into view.
 */
export default function DayStrip({
  todayStartMs,
  offset,
  onSelect,
  maxDays = 30,
}: {
  todayStartMs: number;
  offset: number;
  onSelect: (offset: number) => void;
  maxDays?: number;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [offset]);

  const days = Array.from({ length: maxDays + 1 }, (_, i) => i);

  // App times are station-local epochs read via UTC getters, so the UTC date
  // string IS the station-local calendar date.
  const isoDay = (off: number) =>
    new Date(todayStartMs + off * DAY_MS).toISOString().slice(0, 10);

  const onDatePicked = (value: string) => {
    if (!value) return;
    const ms = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(ms)) return;
    const off = Math.round((ms - todayStartMs) / DAY_MS);
    onSelect(Math.min(maxDays, Math.max(0, off)));
  };

  return (
    <div className="flex gap-2 px-3">
      {/* Calendar chip: an invisible native date input overlays the visual so a
          tap opens the platform date picker (min/max = the 30-day window). */}
      <div className="relative shrink-0">
        <div
          aria-hidden="true"
          className="flex h-full flex-col items-center justify-center rounded-2xl bg-shell/70 px-3 py-2 font-body text-ink-soft"
        >
          <span className="text-lg leading-none">📅</span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wide">
            Date
          </span>
        </div>
        <input
          type="date"
          aria-label="Jump to a date"
          title="Jump to a date"
          value={isoDay(offset)}
          min={isoDay(0)}
          max={isoDay(maxDays)}
          onChange={(e) => onDatePicked(e.currentTarget.value)}
          onClick={(e) => {
            // Desktop browsers focus the field but don't open the calendar
            // popover on click — ask for it (safe no-op where unsupported).
            try {
              e.currentTarget.showPicker();
            } catch {}
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div
        className="flex snap-x gap-2 overflow-x-auto pb-1 pr-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="listbox"
        aria-label="Choose a day"
      >
        {days.map((i) => {
          const ms = todayStartMs + i * DAY_MS;
          const p = dayParts(ms);
          const active = i === offset;
          // Spring tides run biggest near full/new moon — worth a tiny dot.
          const illum = moonPhase(new Date(ms + DAY_MS / 2)).illumination;
          const spring = illum >= 0.94 || illum <= 0.06;
          return (
            <button
              key={i}
              ref={active ? selectedRef : undefined}
              role="option"
              aria-selected={active}
              onClick={() => onSelect(i)}
              className={`flex min-w-[3.6rem] snap-center flex-col items-center rounded-2xl px-3 py-2 font-body transition active:scale-95 ${
                active
                  ? "bg-ocean text-white shadow-[var(--shadow-float)]"
                  : "bg-shell/70 text-ink-soft hover:bg-shell"
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wide">
                {i === 0 ? "Today" : p.weekday}
              </span>
              <span className="font-display text-lg font-semibold leading-none">
                {p.date}
              </span>
              <span className="flex items-center gap-1 text-[10px] opacity-80">
                {p.month}
                {spring && (
                  <span
                    className={`inline-block h-1 w-1 rounded-full ${active ? "bg-white" : "bg-coral"}`}
                    title="Spring tides — full/new moon"
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
