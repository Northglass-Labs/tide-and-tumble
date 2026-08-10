"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  regions,
  activeFromNoaa,
  type ActiveStation,
} from "@/lib/stations";
import { getRecents } from "@/lib/recents";

const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="grid h-72 place-items-center rounded-2xl bg-surface/60 text-ink-soft">
      Loading map…
    </div>
  ),
});

type Mode = "list" | "map";

export default function BeachPicker({
  open,
  onClose,
  currentId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string;
  onSelect: (station: ActiveStation) => void;
}) {
  const [mode, setMode] = useState<Mode>("list");
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Re-read each time the sheet opens. (A lazy useState initializer ran once
  // at mount — while the sheet was still CLOSED — so recents were permanently
  // empty and the Recent section never rendered.)
  const recents = useMemo<ActiveStation[]>(() => (open ? getRecents() : []), [open]);

  if (!open) return null;

  const pick = (s: ActiveStation) => {
    onSelect(s);
    onClose();
  };

  // Resolve the nearest NOAA tide station (nationwide) to a coordinate.
  const resolveNearest = async (
    lat: number,
    lng: number,
    srcLabel?: string,
  ) => {
    try {
      const r = await fetch(`/api/nearest?lat=${lat}&lng=${lng}`);
      const d = await r.json();
      if (!r.ok || !d.nearest) throw new Error("no station");
      const s = activeFromNoaa(d.nearest);
      setBusy(false);
      setStatus(
        `Closest beach${srcLabel ? ` to ${srcLabel}` : ""}: ${s.label} · ${d.nearest.distanceMi} mi`,
      );
      pick(s);
    } catch {
      setBusy(false);
      setStatus("Couldn't find a nearby beach — pick one from the list.");
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setStatus("Location isn't available on this device.");
      return;
    }
    setBusy(true);
    setStatus("Finding the beach closest to you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolveNearest(pos.coords.latitude, pos.coords.longitude),
      () => {
        setBusy(false);
        setStatus("Couldn't get your location — pick a beach below instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const lookupZip = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = zip.trim();
    if (!/^\d{5}$/.test(clean)) {
      setStatus("Enter a 5-digit ZIP code.");
      return;
    }
    setBusy(true);
    setStatus("Looking up that ZIP…");
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${clean}`);
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      const place = data.places?.[0];
      await resolveNearest(
        parseFloat(place.latitude),
        parseFloat(place.longitude),
        `${place["place name"]}, ${place["state abbreviation"]}`,
      );
    } catch {
      setBusy(false);
      setStatus("Couldn't find that ZIP. Try a beach from the list.");
    }
  };

  const exposureTag = (exposure?: string) =>
    exposure === "sound"
      ? "🌾 sound"
      : exposure === "bay"
        ? "🪸 bay"
        : exposure === "inlet"
          ? "🌊 inlet"
          : "🏄 ocean";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-shell p-5 shadow-[var(--shadow-float)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">
            Choose your beach
          </h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-surface text-ink-soft"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Quick actions */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={useMyLocation}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-ocean px-3 py-3 font-body font-bold text-white transition active:scale-95 disabled:opacity-60"
          >
            📍 Near me
          </button>
          <button
            onClick={() => setMode(mode === "map" ? "list" : "map")}
            className="flex items-center justify-center gap-2 rounded-2xl bg-seafoam px-3 py-3 font-body font-bold text-ocean-abyss transition active:scale-95"
          >
            🗺️ {mode === "map" ? "Beach list" : "Pick on map"}
          </button>
        </div>

        {/* ZIP */}
        <form onSubmit={lookupZip} className="mb-3 flex gap-2">
          <input
            inputMode="numeric"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="ZIP code (anywhere in the US)"
            className="w-full rounded-2xl border border-sand-deep bg-white/70 px-4 py-3 font-body text-ink outline-none placeholder:text-ink-soft/60 focus:border-ocean"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-2xl bg-coral px-4 py-3 font-body font-bold text-white transition active:scale-95 disabled:opacity-60"
          >
            Go
          </button>
        </form>

        {status && (
          <p className="mb-3 rounded-xl bg-surface px-3 py-2 text-sm font-body text-ink-soft">
            {status}
          </p>
        )}

        {/* Recently viewed — quick pick */}
        {mode === "list" && recents.filter((r) => r.id !== currentId).length > 0 && (
          <div className="mb-3">
            <h3 className="mb-1.5 px-1 font-display text-xs font-bold uppercase tracking-wide text-ocean-deep">
              Recent
            </h3>
            <div className="flex flex-wrap gap-2">
              {recents
                .filter((r) => r.id !== currentId)
                .map((r) => (
                  <button
                    key={r.id}
                    onClick={() => pick(r)}
                    className="rounded-full bg-seafoam/50 px-3 py-1.5 font-body text-sm font-semibold text-ocean-abyss transition active:scale-95"
                  >
                    {r.label}
                  </button>
                ))}
            </div>
          </div>
        )}

        {mode === "map" ? (
          <MapPicker onSelect={pick} onResolveNearest={resolveNearest} />
        ) : (
          <div className="space-y-4">
            {regions().map(({ region, beaches }) => (
              <div key={region}>
                <h3 className="mb-1.5 px-1 font-display text-xs font-bold uppercase tracking-wide text-ocean-deep">
                  {region}
                </h3>
                <ul className="space-y-1.5">
                  {beaches.map((s) => {
                    const active = s.id === currentId;
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => pick(s)}
                          className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left font-body transition active:scale-[0.98] ${
                            active
                              ? "bg-ocean text-white"
                              : "bg-surface/70 text-ink hover:bg-surface"
                          }`}
                        >
                          <span className="font-bold">{s.label}</span>
                          <span
                            className={`text-xs ${active ? "text-white/80" : "text-ink-soft"}`}
                          >
                            {exposureTag(s.exposure)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="px-1 text-[11px] font-body text-ink-soft/70">
              Don&apos;t see your beach? Tap <b>Near me</b>, enter a ZIP, or drop a
              pin on the map — it finds the closest tide station anywhere in the US.
            </p>
          </div>
        )}
        <p className="mt-4 text-center text-[11px] font-body text-ink-soft/70">
          Tide predictions from NOAA CO-OPS
        </p>
      </div>
    </div>
  );
}
