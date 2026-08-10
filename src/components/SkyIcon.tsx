// Hand-drawn sun/moon icons for the conditions row (original SVG, flat style to
// match StatIcon/Surfer). No emoji, no assets. The MoonDisc renders the ACTUAL
// illuminated fraction + waxing/waning direction from moonPhase(), so the little
// moon on the page always matches the sky. Reduced-motion just freezes the
// gentle sun-ray shimmer; the shapes are static anyway.

const SUN = "#ffb23e";
const SUN_CORE = "#ffd36b";
const MOON = "#e7ecf2";
const MOON_SHADOW = "#a9b4c4";
const HORIZON = "var(--color-ink-soft)";

function Rays() {
  return (
    <g className="sky-rays" stroke={SUN} strokeWidth="1.4" strokeLinecap="round">
      <line x1="12" y1="2.5" x2="12" y2="5" />
      <line x1="5" y1="5" x2="6.6" y2="6.6" />
      <line x1="19" y1="5" x2="17.4" y2="6.6" />
      <line x1="2.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21.5" y2="12" />
    </g>
  );
}

function SunOnHorizon({ down }: { down: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="sky-icon h-[1.15em] w-[1.15em]" aria-hidden="true">
      <Rays />
      {/* half sun rising/setting behind the horizon */}
      <clipPath id={down ? "sunsetClip" : "sunriseClip"}>
        <rect x="0" y="0" width="24" height="16" />
      </clipPath>
      <circle cx="12" cy="16" r="5" fill={SUN} clipPath={`url(#${down ? "sunsetClip" : "sunriseClip"})`} />
      <circle cx="12" cy="16" r="2.6" fill={SUN_CORE} clipPath={`url(#${down ? "sunsetClip" : "sunriseClip"})`} />
      {/* horizon */}
      <line x1="2.5" y1="16" x2="21.5" y2="16" stroke={HORIZON} strokeWidth="1.5" strokeLinecap="round" />
      {/* direction chevron */}
      <path
        d={down ? "M 9 20.5 L 12 22.6 L 15 20.5" : "M 9 22 L 12 19.9 L 15 22"}
        fill="none"
        stroke={SUN}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoonDir({ down }: { down: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="sky-icon h-[1.15em] w-[1.15em]" aria-hidden="true">
      {/* small crescent */}
      <path
        d="M 15.5 5 A 7 7 0 1 0 15.5 17 A 5.4 5.4 0 1 1 15.5 5 Z"
        fill={MOON}
        stroke={MOON_SHADOW}
        strokeWidth="0.6"
      />
      <line x1="2.5" y1="19" x2="21.5" y2="19" stroke={HORIZON} strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <path
        d={down ? "M 9 20.5 L 12 22.6 L 15 20.5" : "M 9 22.6 L 12 20.5 L 15 22.6"}
        fill="none"
        stroke={MOON_SHADOW}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A moon disc showing the true illuminated fraction.
 * `fraction` is moonPhase().fraction (0=new, .25=first qtr, .5=full, .75=last qtr).
 * Terminator is a half-ellipse; the lit limb is on the right when waxing.
 */
export function MoonDisc({ fraction, size = 18 }: { fraction: number; size?: number }) {
  const R = 9;
  const illum = (1 - Math.cos(2 * Math.PI * fraction)) / 2; // 0..1
  const waxing = fraction < 0.5;
  // terminator ellipse x-radius: +R at new → 0 at full → matches crescent/gibbous
  const rx = Math.abs(R * Math.cos(Math.PI * illum));
  const gibbous = illum > 0.5;
  // Lit region as: right semicircle (top→bottom) + terminator ellipse (bottom→top).
  // For crescent the terminator bows toward the dark side (sweep 0); gibbous bows out (sweep 1).
  const sweep = gibbous ? 1 : 0;
  const litPath = `M 0 ${-R} A ${R} ${R} 0 0 1 0 ${R} A ${rx} ${R} 0 0 ${sweep} 0 ${-R} Z`;
  return (
    <svg
      viewBox="-11 -11 22 22"
      width={size}
      height={size}
      className="inline-block align-middle"
      aria-hidden="true"
      style={{ transform: waxing ? undefined : "scaleX(-1)" }}
    >
      {/* dark disc */}
      <circle r={R} fill={MOON_SHADOW} />
      {/* lit portion */}
      {illum > 0.02 && <path d={litPath} fill={MOON} />}
      {/* rim + a couple soft maria for character */}
      <circle r={R} fill="none" stroke="#8b97a8" strokeWidth="0.5" opacity="0.6" />
      <circle cx="-2.5" cy="-2" r="1.5" fill="#c9d2de" opacity="0.5" />
      <circle cx="2" cy="3" r="2" fill="#c9d2de" opacity="0.4" />
    </svg>
  );
}

export function Sunrise() {
  return <SunOnHorizon down={false} />;
}
export function Sunset() {
  return <SunOnHorizon down />;
}
export function Moonrise() {
  return <MoonDir down={false} />;
}
export function Moonset() {
  return <MoonDir down />;
}
