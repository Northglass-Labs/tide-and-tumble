"use client";

import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STATIONS, type ActiveStation } from "@/lib/stations";

// Lightweight emoji pins so we don't depend on image assets.
const pin = (emoji: string) =>
  L.divIcon({
    html: `<div style="font-size:22px;line-height:22px">${emoji}</div>`,
    className: "obx-pin",
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });

function ClickCatcher({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPicker({
  onSelect,
  onResolveNearest,
}: {
  onSelect: (s: ActiveStation) => void;
  onResolveNearest: (lat: number, lng: number, label?: string) => void;
}) {
  // Curated beach markers for quick picking.
  const seen = new Set<string>();
  const markers = STATIONS.filter((s) => {
    const key = `${s.lat},${s.lng}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="h-72 w-full overflow-hidden rounded-2xl">
      <MapContainer
        center={[35.7, -75.6]}
        zoom={6}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Tap anywhere → find the nearest tide station to that point. */}
        <ClickCatcher onPick={(lat, lng) => onResolveNearest(lat, lng)} />
        {markers.map((s) => (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={pin("🏖️")}
            eventHandlers={{ click: () => onSelect(s) }}
          />
        ))}
      </MapContainer>
      <p className="mt-1 px-1 text-[11px] font-body text-ink-soft/70">
        Tap a 🏖️ for a curated beach, or tap anywhere to find the closest tide
        station.
      </p>
    </div>
  );
}
