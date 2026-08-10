// Hand-drawn animated stat icons for the conditions card (water / wind / surf).
// Original line art — pure SVG + CSS keyframes (globals.css), no assets, no libs.
// All motion is subtle and loops slowly; prefers-reduced-motion freezes them into
// clean static icons (the global reduced-motion rule kills the animations, and
// the gust dasharray only applies under `no-preference`, so gusts render solid).

export type StatKind = "water" | "wind" | "surf";

function WaterTemp() {
  return (
    <svg viewBox="0 0 28 28" className="stat-icon h-6 w-6" aria-hidden="true">
      {/* stem */}
      <rect
        x="11.4"
        y="3.5"
        width="5.2"
        height="15"
        rx="2.6"
        fill="var(--color-shell)"
        stroke="var(--color-ink-soft)"
        strokeWidth="1.6"
      />
      {/* mercury column — breathes gently */}
      <rect
        x="13"
        y="9.5"
        width="2"
        height="9"
        rx="1"
        fill="var(--color-coral)"
        className="stat-mercury"
      />
      {/* bulb */}
      <circle
        cx="14"
        cy="21.2"
        r="3.9"
        fill="var(--color-coral)"
        stroke="var(--color-ink-soft)"
        strokeWidth="1.6"
      />
      {/* scale ticks */}
      <line x1="18.8" y1="7" x2="21" y2="7" stroke="var(--color-ink-soft)" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="18.8" y1="10.5" x2="20.4" y2="10.5" stroke="var(--color-ink-soft)" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="18.8" y1="14" x2="21" y2="14" stroke="var(--color-ink-soft)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Wind() {
  return (
    <svg viewBox="0 0 28 28" className="stat-icon h-6 w-6" aria-hidden="true">
      {/* three gust streams, flowing with staggered phase */}
      <path
        d="M3 9.5 H14.5 A3.1 3.1 0 1 0 11.4 4.9"
        pathLength={100}
        fill="none"
        stroke="var(--color-ocean-deep)"
        strokeWidth="2"
        strokeLinecap="round"
        className="stat-gust"
      />
      <path
        d="M2.5 14.8 H19.2 A3.4 3.4 0 1 1 15.8 21"
        pathLength={100}
        fill="none"
        stroke="var(--color-ocean)"
        strokeWidth="2"
        strokeLinecap="round"
        className="stat-gust"
        style={{ animationDelay: "-0.9s" }}
      />
      <path
        d="M5 20.4 H11.5"
        pathLength={100}
        fill="none"
        stroke="var(--color-ink-soft)"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="stat-gust"
        style={{ animationDelay: "-1.8s" }}
      />
    </svg>
  );
}

function Surf() {
  return (
    <svg viewBox="0 0 28 28" className="stat-icon h-6 w-6" aria-hidden="true">
      <defs>
        <clipPath id="statSurfClip">
          <rect x="2" y="5.5" width="24" height="18" rx="5" />
        </clipPath>
      </defs>
      <g clipPath="url(#statSurfClip)">
        {/* back swell — slower, lighter, drifting the other way */}
        <path
          d="M-14 14.5 q3.5 -4.5 7 0 t7 0 t7 0 t7 0 t7 0 t7 0"
          fill="none"
          stroke="var(--color-ocean)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.45"
          className="stat-wave-back"
        />
        {/* front wave */}
        <path
          d="M-10.5 18.5 q3.5 -5 7 0 t7 0 t7 0 t7 0 t7 0 t7 0"
          fill="none"
          stroke="var(--color-ocean-deep)"
          strokeWidth="2.3"
          strokeLinecap="round"
          className="stat-wave-front"
        />
        {/* foam flecks bobbing above the crest */}
        <circle cx="9" cy="10.6" r="1.15" fill="var(--color-ocean-deep)" opacity="0.5" className="stat-foam" />
        <circle
          cx="17.5"
          cy="9.4"
          r="0.9"
          fill="var(--color-ocean)"
          opacity="0.55"
          className="stat-foam"
          style={{ animationDelay: "-1.1s" }}
        />
      </g>
    </svg>
  );
}

export default function StatIcon({ kind }: { kind: StatKind }) {
  if (kind === "water") return <WaterTemp />;
  if (kind === "wind") return <Wind />;
  return <Surf />;
}
