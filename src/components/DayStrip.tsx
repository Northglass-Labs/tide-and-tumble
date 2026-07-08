"use client";

import { useEffect, useRef } from "react";
import { DAY_MS, dayParts } from "@/lib/tides";

/**
 * A horizontally scrollable strip of day chips (Today → +maxDays), weather-app
 * style. Tapping a chip selects that day; the selected chip auto-scrolls into view.
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

  return (
    <div className="px-3">
      <div
        className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="listbox"
        aria-label="Choose a day"
      >
        {days.map((i) => {
          const ms = todayStartMs + i * DAY_MS;
          const p = dayParts(ms);
          const active = i === offset;
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
              <span className="text-[10px] opacity-80">{p.month}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
