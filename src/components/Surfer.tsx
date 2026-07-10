// The Tide & Tumble surfer — an original, hand-drawn inline SVG character
// (replaces the stock Fluent emoji sprite). Drawn flat-style to match the scene,
// centered on (0,0) like Sprite so it slots into the same animation wrappers.
//
// Parts animate independently (CSS keyframes in globals.css, per house rules):
//   .surfer-carve  — whole rider+board rocks around the board's waterline
//   .surfer-body   — rider leans as if working the board
//   .surfer-hair   — salty tuft flutters in the wind
//   .surfer-blink  — eyes blink every few seconds
//   .surfer-spray  — droplets kick off the tail (hidden at slack tide)
//   .surfer-wake   — foam pulse under the board
// prefers-reduced-motion: global rule freezes everything; spray is hidden too.

export type SurferEnergy = "cruise" | "chill";

export default function Surfer({
  size = 64,
  facing = 1,
  energy = "cruise",
}: {
  size?: number;
  facing?: number;
  /** "chill" (slack tide): slower carve, no spray. */
  energy?: SurferEnergy;
}) {
  const s = size / 64; // drawn in a 64-unit local space
  const slow = energy === "chill";
  return (
    <g transform={`scale(${facing === -1 ? -s : s},${s})`}>
      <g
        className="surfer-carve"
        style={slow ? { animationDuration: "7.5s" } : undefined}
      >
        {/* wake foam hugging the tail + trailing off the nose */}
        <ellipse cx="-17" cy="23.2" rx="9" ry="2.5" fill="#ffffff" opacity="0.55" className="surfer-wake" />
        <ellipse cx="14" cy="24" rx="6.5" ry="1.9" fill="#ffffff" opacity="0.35" className="surfer-wake" style={{ animationDelay: "-1.2s" }} />

        {/* spray kicking off the tail */}
        {!slow && (
          <g className="surfer-sprayGroup">
            <circle cx="-23" cy="18" r="2.1" fill="#ffffff" opacity="0" className="surfer-spray" />
            <circle cx="-25" cy="20" r="1.4" fill="#ffffff" opacity="0" className="surfer-spray" style={{ animationDelay: "-0.55s" }} />
            <circle cx="-21" cy="21" r="1.7" fill="#ffffff" opacity="0" className="surfer-spray" style={{ animationDelay: "-1.1s" }} />
          </g>
        )}

        {/* the board — nose up, coral stripe, little fin */}
        <g transform="rotate(-6 0 20)">
          <rect x="-26" y="17" width="52" height="6.4" rx="3.2" fill="var(--color-shell)" />
          <rect x="-26" y="19.1" width="52" height="1.7" fill="var(--color-coral)" opacity="0.85" />
          <rect x="-26" y="17" width="52" height="6.4" rx="3.2" fill="none" stroke="#d8cfc0" strokeWidth="0.8" />
          <path d="M -19 23.2 q -1.6 3.4 -3.4 3.9 q 0.4 -2.6 1.2 -4.1 Z" fill="var(--color-coral)" />
        </g>

        {/* leash: back ankle → tail */}
        <path
          d="M -9 14.5 Q -16 18 -22.5 19.5"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="0.9"
          opacity="0.55"
        />

        {/* the rider */}
        <g className="surfer-body">
          {/* back leg (bent, weight low) */}
          <path d="M -8.5 15.5 Q -7.5 9.5 -3.5 6.5" fill="none" stroke="#e59a63" strokeWidth="3.4" strokeLinecap="round" />
          {/* front leg */}
          <path d="M 8 14.5 Q 8.5 9.5 4.5 6.5" fill="none" stroke="#e59a63" strokeWidth="3.4" strokeLinecap="round" />
          {/* board shorts */}
          <path d="M -6 3 Q 0 0.6 6 3 L 5 7.4 Q 0 5.6 -5 7.4 Z" fill="var(--color-coral)" />
          {/* torso — sunny rash guard (NOT ocean-colored: she surfs in front of the sea now) */}
          <path d="M -5.5 4 Q -4.2 -7 2 -9.6 L 7 -6.8 Q 6.3 0.5 4.8 4.6 Q 0 2.8 -5.5 4 Z" fill="#ffc94d" />
          {/* back arm — raised high for balance */}
          <path d="M 0 -6.5 Q -6 -9 -10.5 -14.5" fill="none" stroke="#e59a63" strokeWidth="3" strokeLinecap="round" />
          <path d="M 0 -6.5 Q -3.5 -8 -6 -10.5" fill="none" stroke="#ffc94d" strokeWidth="3.4" strokeLinecap="round" />
          {/* front arm — reaching over the nose */}
          <path d="M 4 -7 Q 10.5 -7.5 14.5 -4.5" fill="none" stroke="#e59a63" strokeWidth="3" strokeLinecap="round" />
          <path d="M 4 -7 Q 7 -7.6 9.5 -6.6" fill="none" stroke="#ffc94d" strokeWidth="3.4" strokeLinecap="round" />

          {/* head — ¾ chibi, looking down the line */}
          <g transform="translate(5,-13.8)">
            <circle r="6.2" fill="#eda66f" />
            {/* sun-bleached hair: swept crown + flutter tuft */}
            <path d="M -6 -1.4 Q -5.4 -6.4 -0.4 -6.6 Q 5 -6.8 6.2 -2.4 Q 3.4 -4.4 0.6 -3.8 Q -2.6 -3.2 -3.4 -0.6 Q -4.6 -0.2 -6 -1.4 Z" fill="#d9a05b" />
            <path
              d="M -5.6 -2.6 Q -8.6 -3.4 -9.8 -1.4 Q -8 -0.9 -6.6 -0.4 Z"
              fill="#d9a05b"
              className="surfer-hair"
            />
            {/* eyes (blink) */}
            <g className="surfer-blink">
              <circle cx="1.6" cy="-0.4" r="0.85" fill="var(--color-ink)" />
              <circle cx="4.6" cy="-0.4" r="0.85" fill="var(--color-ink)" />
            </g>
            {/* stoked smile + blush */}
            <path d="M 2 2.2 Q 3.4 3.6 5 2.4" fill="none" stroke="var(--color-ink)" strokeWidth="0.8" strokeLinecap="round" />
            <circle cx="-0.6" cy="1.6" r="1" fill="#f3876d" opacity="0.55" />
          </g>
        </g>
      </g>
    </g>
  );
}
