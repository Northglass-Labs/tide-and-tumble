// A hand-drawn gliding seagull (original art — replaces a mislabeled stock
// sprite that was actually a red cardinal). Centered on (0,0); the caller's
// groups handle flight-path motion. Wings flap around their shoulder joints
// (.gull-wing-far / .gull-wing-near, keyframes in globals.css); under
// prefers-reduced-motion the global rule freezes them into a clean glide.

export default function Gull({ size = 26 }: { size?: number }) {
  const s = size / 26;
  return (
    <g transform={`scale(${s})`}>
      {/* far wing (behind body, slightly darker) */}
      <path
        d="M 1 -1.5 Q 8 -9 14.5 -9.5 Q 10 -4.5 5 -1.8 Z"
        fill="#c9d4d9"
        className="gull-wing-far"
      />
      {/* body — white with a soft grey back */}
      <path d="M -9 0.5 Q -3 -3.6 3 -2.8 Q 8.5 -2 11 1 Q 5 3.6 -2 3.2 Q -6.5 3 -9 0.5 Z" fill="#fdfdfa" />
      <path d="M -6 -0.8 Q 0 -3.4 6 -2.4 Q 1 -1 -3 0.2 Z" fill="#dfe7ea" opacity="0.9" />
      {/* tail feathers */}
      <path d="M -9 0.5 L -13 -1.5 L -12.4 1.8 Z" fill="#e8edef" />
      {/* head + beak + eye */}
      <circle cx="9.5" cy="-1.6" r="3.4" fill="#fdfdfa" />
      <path d="M 12.6 -2 L 16 -1 L 12.5 0.2 Z" fill="#f2a341" />
      <circle cx="10.2" cy="-2.4" r="0.7" fill="#123a42" />
      {/* near wing (in front, flaps opposite phase) */}
      <path
        d="M -1 -0.5 Q 4 -11 12 -12.5 Q 8.5 -5.5 3.5 -1 Z"
        fill="#eef3f4"
        stroke="#d3dde0"
        strokeWidth="0.5"
        className="gull-wing-near"
      />
    </g>
  );
}
