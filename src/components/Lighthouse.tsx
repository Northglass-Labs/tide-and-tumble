/**
 * Original hand-drawn whimsical lighthouse — a chubby tapered tower with
 * coral candy stripes, a porthole, a railed gallery, and a warm lantern.
 * Drawn around its BASE CENTER (0,0), extending up to y≈-79, natural height
 * ~80 units; `size` scales it. The lantern's local center is (0,-64) — anchor
 * the rotating beacon beam there. Colors ride the theme tokens (coral bands
 * soften at night; the lantern glow strengthens via --beam-op).
 */
export default function Lighthouse({ size = 80 }: { size?: number }) {
  const s = size / 80;
  return (
    <g transform={`scale(${s})`}>
      {/* lantern glow — behind everything, stronger at dusk/night (--beam-op) */}
      <circle
        cx="0"
        cy="-64"
        r="9"
        fill="#ffd98f"
        opacity="var(--beam-op, 0.28)"
      />

      {/* tapered tower */}
      <path
        d="M -13 0 L -7 -52 L 7 -52 L 13 0 Z"
        fill="#fdf6ec"
        stroke="#c9b8a6"
        strokeWidth="0.8"
      />
      {/* coral candy stripes (trapezoids matched to the taper) */}
      <path d="M -11.6 -12 L -10.8 -19 L 10.8 -19 L 11.6 -12 Z" fill="var(--color-coral)" />
      <path d="M -10.0 -26 L -9.2 -33 L 9.2 -33 L 10.0 -26 Z" fill="var(--color-coral)" />
      <path d="M -8.4 -40 L -7.8 -45 L 7.8 -45 L 8.4 -40 Z" fill="var(--color-coral)" />

      {/* arched door + knob */}
      <path
        d="M -3.4 0 L -3.4 -5.5 A 3.4 4 0 0 1 3.4 -5.5 L 3.4 0 Z"
        fill="var(--color-ocean-deep)"
      />
      <circle cx="1.9" cy="-3" r="0.55" fill="#ffd98f" />

      {/* porthole */}
      <circle cx="0" cy="-23" r="2.4" fill="#cfe9f0" stroke="#fdf6ec" strokeWidth="1.1" />

      {/* gallery ledge + railing */}
      <rect x="-10" y="-56" width="20" height="3.2" rx="1.2" fill="var(--color-coral)" />
      {[-8.5, -4.25, 0, 4.25, 8.5].map((px) => (
        <line
          key={px}
          x1={px}
          y1="-56"
          x2={px}
          y2="-60.5"
          stroke="#c9b8a6"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
      ))}
      <line x1="-9" y1="-60.5" x2="9" y2="-60.5" stroke="#c9b8a6" strokeWidth="1" strokeLinecap="round" />

      {/* lantern room */}
      <rect x="-5.2" y="-68" width="10.4" height="8" rx="1" fill="#ffdf94" stroke="#c9b8a6" strokeWidth="0.8" />
      <line x1="-1.7" y1="-68" x2="-1.7" y2="-60" stroke="#c9b8a6" strokeWidth="0.7" />
      <line x1="1.7" y1="-68" x2="1.7" y2="-60" stroke="#c9b8a6" strokeWidth="0.7" />

      {/* swoopy roof + finial */}
      <path d="M -7 -68 Q 0 -79 7 -68 Z" fill="var(--color-coral)" />
      <circle cx="0" cy="-77.5" r="1.6" fill="#ffd98f" stroke="#c9b8a6" strokeWidth="0.5" />
    </g>
  );
}
