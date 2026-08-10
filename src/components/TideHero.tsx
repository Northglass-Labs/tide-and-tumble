"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { TideNow } from "@/lib/tides";
import Sprite from "./Sprite";
import Surfer from "./Surfer";
import Gull from "./Gull";
import Lighthouse from "./Lighthouse";
import WaterSparkles from "./WaterSparkles";
import AnimatedEmoji from "./AnimatedEmoji";

const VB_W = 400;
const VB_H = 340;
// Beach perspective: bottom of frame = the sand at your feet, horizon at top.
// The OCEAN is static (horizon → frame bottom); the SAND APRON slides over it
// with the tide. High tide pushes the surf line DOWN toward the viewer.
const HORIZON = 148; // ocean meets sky
const SHORE_LOW = 216; // surf line at dead low — wide flats
const SHORE_HIGH = 300; // surf line at max high — waves near your feet

// Fixed star field (x, y, radius, twinkle?) — faded in on dusk/night.
const STARS: [number, number, number, boolean][] = [
  [24, 30, 1.1, true], [58, 64, 0.8, false], [92, 22, 1.3, true],
  [130, 52, 0.9, false], [166, 28, 1.1, true], [200, 60, 0.8, false],
  [236, 34, 1.2, true], [270, 20, 0.9, false], [300, 48, 1.0, true],
  [356, 30, 1.1, false], [384, 58, 0.9, true], [46, 104, 0.8, false],
  [110, 92, 1.0, true], [180, 110, 0.9, false], [248, 96, 1.1, true],
  [312, 112, 0.8, false], [376, 96, 1.0, true], [148, 132, 0.8, false],
];

/**
 * The hero scene, Tiny-Wings styled: a multi-stop sky with a big soft sun,
 * layered parallax dune silhouettes on the horizon, and an ocean whose level =
 * the current tide, full of Fluent Emoji creatures with organic, lifelike motion.
 * Water level animates via a CSS transition; everything else is CSS keyframes
 * with easing tokens (Motion on an SVG <g> clobbers child transforms).
 */
export default function TideHero({ now }: { now: TideNow }) {
  const reduce = useReducedMotion();
  const rising = now.direction === "rising";
  const level = now.level;

  const shoreY = SHORE_LOW + level * (SHORE_HIGH - SHORE_LOW);
  const isLow = level < 0.3;
  const nearHigh = rising && level > 0.72;
  // Fluent fish/turtle face left by default → flip to face shoreward when rising.
  const facing = rising ? -1 : 1;
  // Kenney fish face right by default → the mirror of the above.
  const kenneyFacing = rising ? 1 : -1;

  // — Easter eggs: tap the creatures for a quip; tap the sun thrice for shades —
  const [quip, setQuip] = useState<{ text: string; n: number } | null>(null);
  const [poke, setPoke] = useState<string | null>(null); // which sprite just got booped
  const [sunTaps, setSunTaps] = useState(0);
  const shades = sunTaps >= 3;
  const quipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quipN = useRef(0);

  const say = useCallback((lines: string[], who?: string) => {
    const text = lines[Math.floor(Math.random() * lines.length)];
    quipN.current += 1;
    setQuip({ text, n: quipN.current });
    if (quipTimer.current) clearTimeout(quipTimer.current);
    quipTimer.current = setTimeout(() => setQuip(null), 2600);
    if (who) {
      setPoke(who);
      if (pokeTimer.current) clearTimeout(pokeTimer.current);
      pokeTimer.current = setTimeout(() => setPoke(null), 650);
    }
  }, []);

  // Wraps a scene sprite so tapping it fires a reaction (a quip + a quick pop).
  const Boop = ({
    who,
    lines,
    onTap,
    children,
  }: {
    who: string;
    lines: string[];
    onTap?: () => void;
    children: ReactNode;
  }) => (
    <g
      role="button"
      tabIndex={-1}
      aria-label={`${who} — tap me`}
      style={{ cursor: "pointer", pointerEvents: "auto", outline: "none", WebkitTapHighlightColor: "transparent" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onTap?.();
        say(lines, who);
      }}
    >
      <g
        style={
          !reduce && poke === who
            ? { animation: "boop 0.6s var(--ease-pop)", transformBox: "fill-box", transformOrigin: "center" }
            : undefined
        }
      >
        {children}
      </g>
    </g>
  );

  // Animation style helper (skipped under reduced motion).
  const A = (animation: string, origin?: string): CSSProperties | undefined =>
    reduce
      ? undefined
      : {
          animation,
          transformBox: "fill-box",
          ...(origin ? { transformOrigin: origin } : null),
        };

  return (
    <div className="relative w-full overflow-hidden rounded-b-[2.5rem] shadow-[var(--shadow-card)] [container-type:inline-size]">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="block w-full"
        role="img"
        aria-label={`Beach scene: tide is ${now.direction} at ${now.height.toFixed(
          1,
        )} feet, water at ${Math.round(level * 100)} percent of today's range`}
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-sky-top)" }} />
            <stop offset="100%" style={{ stopColor: "var(--color-sky-bottom)" }} />
          </linearGradient>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-seafoam)" }} />
            <stop offset="30%" style={{ stopColor: "var(--color-ocean)" }} />
            <stop offset="100%" style={{ stopColor: "var(--color-ocean-deep)" }} />
          </linearGradient>
          <radialGradient id="sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: "var(--sun-core)" }} />
            <stop offset="55%" style={{ stopColor: "var(--sun-mid)" }} />
            <stop offset="100%" style={{ stopColor: "var(--sun-edge)" }} />
          </radialGradient>
          <radialGradient id="sunHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: "var(--halo)" }} stopOpacity="0.55" />
            <stop offset="100%" style={{ stopColor: "var(--halo)" }} stopOpacity="0" />
          </radialGradient>
          {/* Lighthouse beam — bright at the lantern, fading with distance.
              --beam-op strengthens it at dusk/night (set per theme). */}
          <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffe9a3" stopOpacity="var(--beam-op, 0.28)" />
            <stop offset="100%" stopColor="#ffe9a3" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beach" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-sand)" }} />
            <stop offset="55%" style={{ stopColor: "var(--color-sand)" }} />
            <stop offset="100%" style={{ stopColor: "var(--color-sand-deep)" }} />
          </linearGradient>
          {(["Far", "Mid", "Near"] as const).map((k) => (
            <linearGradient key={k} id={`dune${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: `var(--dune-${k.toLowerCase()}-lite)` }} />
              <stop offset="100%" style={{ stopColor: `var(--dune-${k.toLowerCase()})` }} />
            </linearGradient>
          ))}
        </defs>

        {/* Sky */}
        <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#sky)" />

        {/* Stars — faded in on dusk/night via --star-op */}
        <g style={{ opacity: "var(--star-op)" }}>
          {STARS.map(([sx, sy, r, tw], i) => (
            <circle
              key={i}
              cx={sx}
              cy={sy}
              r={r}
              fill="#fffbe8"
              style={
                !reduce && tw
                  ? { animation: `twinkle ${2 + (i % 3)}s ease-in-out ${(i % 5) * 0.4}s infinite` }
                  : undefined
              }
            />
          ))}
        </g>

        {/* Shooting star — a rare, night-only streak (CSS-gated + animated;
            hidden entirely under reduced motion and outside the night theme) */}
        <line
          className="shooting-star"
          aria-hidden="true"
          x1="0"
          y1="0"
          x2="24"
          y2="9"
          stroke="#fffbe8"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Sun / moon with soft halo + gentle light rays */}
        <circle cx="332" cy="66" r="66" fill="url(#sunHalo)" />
        <g opacity="0.5">
          <polygon points="332,66 300,-30 364,-30" style={{ fill: "var(--sun-core)" }} opacity="0.16" />
          <polygon points="332,66 392,-20 430,40" style={{ fill: "var(--sun-core)" }} opacity="0.1" />
        </g>
        <g
          role="button"
          tabIndex={-1}
          aria-label="sun — tap me"
          style={{ cursor: "pointer", outline: "none", WebkitTapHighlightColor: "transparent" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const next = sunTaps + 1;
            setSunTaps(next);
            say(next >= 3 ? SUN_SHADES_QUIPS : SUN_QUIPS, "sun");
          }}
        >
          <circle cx="332" cy="66" r="24" fill="url(#sun)" />
          {/* Easter egg: the sun puts its shades on after three taps 😎 */}
          {shades && (
            <g
              style={
                reduce
                  ? undefined
                  : { animation: "dropShades 0.5s var(--ease-pop)", transformBox: "fill-box", transformOrigin: "center top" }
              }
            >
              <path d="M316 64 h32 M330 65 a2 6 0 0 0 -0.2 1" stroke="#2a2a33" strokeWidth="2.4" fill="none" />
              <rect x="318" y="63" width="11" height="8" rx="3" fill="#23232b" />
              <rect x="335" y="63" width="11" height="8" rx="3" fill="#23232b" />
              <rect x="319" y="64" width="4" height="2.4" rx="1" fill="#8fd0ff" opacity="0.85" />
              <rect x="336" y="64" width="4" height="2.4" rx="1" fill="#8fd0ff" opacity="0.85" />
            </g>
          )}
        </g>

        {/* Drifting clouds */}
        {!reduce && (
          <>
            <g style={A("drift 78s linear infinite")}>
              <g transform="translate(0,40)"><Sprite name="cloud" size={54} /></g>
            </g>
            <g style={A("drift 116s linear -45s infinite")}>
              <g transform="translate(0,22)"><Sprite name="cloud" size={34} opacity={0.9} /></g>
            </g>
            <g style={A("drift 140s linear -90s infinite")}>
              <g transform="translate(0,150)"><Sprite name="cloud" size={44} opacity={0.7} /></g>
            </g>
          </>
        )}

        {/* A hand-drawn gull gliding across the sky, wings flapping at the
            shoulder. The transform attribute is the reduced-motion parking
            spot — the CSS flight animation overrides it whenever motion is
            allowed (without it the gull froze clipped at the 0,0 corner). */}
        <g transform="translate(84,52)" style={A("birdFly 24s var(--ease-bob) infinite")}>
          <Gull size={26} />
        </g>

        {/* Distant coastline — low dune silhouettes hugging the horizon, like
            the shore curving away up the beach. The ocean laps their base. */}
        <g style={{ ...A("wave 200s linear infinite"), filter: "blur(1.2px)", opacity: 0.55 }}>
          <path d={dunePath(134, 7, 300, HORIZON + 3)} fill="url(#duneFar)" />
        </g>
        <g style={{ ...A("wave 120s linear infinite"), opacity: 0.7 }}>
          <path d={dunePath(141, 8, 220, HORIZON + 3)} fill="url(#duneMid)" />
        </g>

        {/* THE OCEAN — static, horizon to frame bottom. The sand apron
            (later in paint order) slides over it with the tide, so the surf
            line is simply the sand's top edge. Lighter at the horizon,
            deepening toward the viewer. */}
        <rect x="0" y={HORIZON} width={VB_W} height={VB_H - HORIZON} fill="url(#water)" />
        <rect x="0" y={HORIZON} width={VB_W} height="14" fill="#ffffff" opacity="0.14" />
        <line x1="0" y1={HORIZON} x2={VB_W} y2={HORIZON} stroke="#ffffff" opacity="0.3" strokeWidth="1" />
        {/* Rolling swell — rows of waves receding in perspective: tight and
            faint near the horizon, taller and bolder toward the viewer,
            alternating directions so the sea visibly rolls. Each row is a
            shadowed wave silhouette with a crest highlight riding its edge
            (crest + shadow share speed/direction so they travel together). */}
        {[
          { y: 158, amp: 2, seg: 55, dur: 15, rev: true, sh: 0.08, cr: 0.2 },
          { y: 172, amp: 3, seg: 75, dur: 13, rev: false, sh: 0.1, cr: 0.22 },
          { y: 190, amp: 4.5, seg: 100, dur: 11, rev: true, sh: 0.12, cr: 0.25 },
          { y: 212, amp: 5.5, seg: 130, dur: 9, rev: false, sh: 0.13, cr: 0.28 },
          { y: 238, amp: 6.5, seg: 165, dur: 7.5, rev: true, sh: 0.14, cr: 0.3 },
        ].map((row, i) => (
          <g key={row.y} transform={`translate(0,${row.y})`}>
            <g
              style={{
                ...A(`wave ${row.dur}s linear infinite${row.rev ? " reverse" : ""}`),
                opacity: row.sh,
              }}
            >
              <path d={waveTopPath(i, row.amp, row.seg)} className="fill-ocean-deep" />
            </g>
            <g
              style={{
                ...A(`wave ${row.dur}s linear infinite${row.rev ? " reverse" : ""}`),
                opacity: row.cr,
              }}
            >
              <path
                d={foamPath(row.amp, row.seg, 1.4 + i * 0.35)}
                className={i === 4 ? "fill-white ocean-foam-bio" : "fill-white"}
              />
            </g>
          </g>
        ))}
        {/* Whitecaps winking on the open water */}
        {[
          [70, 170, 0],
          [180, 186, -2.4],
          [305, 174, -4.8],
          [140, 202, -7.2],
        ].map(([wx, wy, delay]) => (
          <path
            key={wx}
            d={`M ${wx} ${wy} q 5 -3 10 0`}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.4"
            className="ocean-whitecap"
            style={reduce ? undefined : { animationDelay: `${delay}s` }}
          />
        ))}


        {/* The lighthouse pier — a little wooden pier runs in from off-frame
            right on stilts, and our hand-drawn lighthouse lives out at its
            end. The deck sits just above the high-tide line, so the (moving)
            water visibly climbs the pilings on the flood and strands them on
            the ebb — the pier tells the tide story too. */}
        <g>
          {/* pilings: deck down into the seabed */}
          {[340, 367.5, 393.5].map((px) => (
            <rect key={px} x={px} y="180" width="4.5" height="130" rx="2" fill="#8a6544" />
          ))}
          {/* cross-braces (upper third — above most waterlines) */}
          <g stroke="#7e5a40" strokeWidth="1.8" strokeLinecap="round" opacity="0.85">
            <line x1="343" y1="196" x2="369" y2="248" />
            <line x1="369" y1="196" x2="343" y2="248" />
            <line x1="370" y1="202" x2="395" y2="252" />
            <line x1="395" y1="202" x2="370" y2="252" />
          </g>
          {/* deck boards */}
          <rect x="336" y="178" width="68" height="5.5" rx="1.5" fill="#a8795a" stroke="#7e5a40" strokeWidth="0.7" />
          {[348, 360, 372, 384, 396].map((px) => (
            <line key={px} x1={px} y1="178.6" x2={px} y2="183" stroke="#7e5a40" strokeWidth="0.6" opacity="0.5" />
          ))}

          {/* Beam: two opposite soft cones rotating from the lantern (0,-64
              in lighthouse-local coords → (372, 32) here) */}
          <g transform="translate(372,114)" style={{ mixBlendMode: "screen" }}>
            <g style={A("beacon 9s linear infinite", "center")}>
              <polygon points="0,0 150,-30 150,30" fill="url(#beam)" />
              <polygon points="0,0 -150,-30 -150,30" fill="url(#beam)" />
            </g>
          </g>

          {/* the lighthouse itself — tap it for keeper wisdom */}
          <g transform="translate(372,178)">
            <Boop who="lighthouse" lines={LIGHTHOUSE_QUIPS}>
              <Lighthouse size={80} />
            </Boop>
          </g>
        </g>

        {/* Out in the water: creatures seen through the surface, slightly
            ghosted. They live in the always-water zone just below the horizon,
            so no tide can beach them. */}
        <g opacity="0.92">
          {/* Ambient jellyfish, pulsing */}
          <g transform="translate(64,168)">
            <g style={A("bob 5s var(--ease-bob) infinite")}>
              <g style={A("pulse 2.6s var(--ease-pop) infinite", "center top")}>
                <Sprite name="jellyfish" size={30} />
              </g>
            </g>
          </g>

          {/* A whale cruises the deep only on a good high tide — tap to hear it */}
          {level > 0.74 && (
            <g transform="translate(236,168)">
              <g style={A("whaleGlide 20s var(--ease-swim) infinite")}>
                <Boop who="whale" lines={WHALE_QUIPS}>
                  <Sprite name="whale" size={64} facing={facing} />
                </Boop>
              </g>
            </g>
          )}

          {/* Fish school — each darts (burst-then-coast), staggered */}
          <Fish x={300} y={160} size={26} dur={5.2} delay={0} facing={facing} A={A} sprite="tropical_fish" />
          <Fish x={268} y={176} size={21} dur={5.9} delay={-1.6} facing={facing} A={A} sprite="fish" />
          <Fish x={150} y={186} size={24} dur={6.8} delay={-0.8} facing={kenneyFacing} A={A} sprite="kenney_fish_blue" />
          {/* Swim-by visitors: cross the whole scene, then gone for a while.
              The transform attribute parks them off-screen — the CSS traversal
              overrides it whenever motion is allowed (gull pattern). */}
          <g transform="translate(440,0)" style={A("swimAcrossL 34s linear infinite")}>
            <g transform="translate(0,170)">
              <Sprite name="fish" size={18} facing={1} />
            </g>
          </g>
          <g transform="translate(-60,0)" style={A("swimAcrossR 52s linear 9s infinite")}>
            <g transform="translate(0,192)">
              <Sprite name="kenney_fish_red" size={20} facing={1} />
            </g>
          </g>

          {/* Turtle — slow glide + bob out in the swell — tap for turtle wisdom */}
          <g transform="translate(112,166)">
            <g style={A("dart 11s var(--ease-glide) infinite")}>
              <g style={A("bob 4s var(--ease-bob) infinite")}>
                <Boop who="turtle" lines={TURTLE_QUIPS}>
                  <Sprite name="turtle" size={46} facing={facing} />
                </Boop>
              </g>
            </g>
          </g>
        </g>

        {/* Sailboat out near the horizon, rocking */}
        <g transform="translate(296,138)">
          <g style={A("bob 5s var(--ease-bob) infinite")}>
            <g style={A("surf 6s var(--ease-swim) infinite", "bottom center")}>
              <Sprite name="sailboat" size={34} />
            </g>
          </g>
        </g>

        {/* THE SAND APRON — the beach in the foreground, sliding over the
            static ocean with the tide (translateY tweens). Its wavy top edge
            IS the surf line: foam rides it, the wet band sits just below it,
            and the tide pools + shells ride the flats (they slide below the
            frame at high tide — hidden for free). */}
        <g
          style={{
            transform: `translateY(${shoreY}px)`,
            transition: reduce ? undefined : "transform 1.4s var(--ease-glide)",
          }}
        >
          {/* second breaker line just offshore */}
          <g transform="translate(0,-13)" style={{ ...A("wave 13s linear infinite reverse"), opacity: 0.35 }}>
            <path d={foamPath(4, VB_W / 3, 2.4)} className="fill-white ocean-foam-bio" />
          </g>

          {/* Surfer — rides the break just off the surf line, so the tide
              carries them in and out with it. Tap for surf slang. */}
          <g transform="translate(206,-24)">
            <g style={A("bob 3s var(--ease-bob) infinite")}>
              <Boop
                who="surfer"
                lines={isLow ? [...SURFER_QUIPS, ...SURFER_LOW_TIDE_QUIPS] : SURFER_QUIPS}
              >
                <Surfer
                  size={56}
                  facing={rising ? 1 : -1}
                  energy={
                    now.phase === "high-slack" || now.phase === "low-slack"
                      ? "chill"
                      : "cruise"
                  }
                />
              </Boop>
            </g>
          </g>

          {/* wet sand edge (wavy), then the dry sand body 7px lower */}
          <path d={waveTopPath(0, 4, VB_W / 3)} className="fill-sand-deep" opacity="0.55" />
          <g transform="translate(0,7)">
            <path d={waveTopPath(2, 4, VB_W / 3)} fill="url(#beach)" />
          </g>
          {/* breaking foam riding the surf line */}
          <g transform="translate(0,-3)" style={{ ...A("wave 9.5s linear infinite"), opacity: 0.8 }}>
            <path d={foamPath(5, VB_W / 4, 3.4)} className="fill-white ocean-foam-bio" />
          </g>
          <g transform="translate(0,2)" style={{ ...A("wave 7s linear infinite"), opacity: 0.4 }}>
            {[30, 150, 265, 420, 545, 660].map((fx, i) => (
              <rect key={fx} x={fx} y={(i % 3) * 2.5} width={12 + (i % 3) * 6} height="2" rx="1" fill="#ffffff" className="ocean-foam-bio" />
            ))}
          </g>

          {/* the flats: tide pools, shells, a breathing starfish */}
          <g aria-hidden="true">
            <ellipse cx="92" cy="30" rx="24" ry="5.5" className="fill-seafoam" opacity="0.5" />
            <ellipse cx="92" cy="30" rx="16" ry="3.4" fill="url(#water)" opacity="0.5" />
            <ellipse cx="296" cy="40" rx="18" ry="4.5" className="fill-seafoam" opacity="0.45" />
            <ellipse cx="296" cy="40" rx="12" ry="2.8" fill="url(#water)" opacity="0.45" />
            <ellipse cx="180" cy="24" rx="4" ry="1.6" className="fill-sand-deep" opacity="0.7" />
            <ellipse cx="330" cy="26" rx="3.2" ry="1.4" className="fill-sand-deep" opacity="0.65" />
            <path d="M 148 44 a 3 3 0 0 1 6 0 l -3 1.6 Z" fill="#f7ede0" opacity="0.9" />
            <path d="M 252 30 a 2.6 2.6 0 0 1 5.2 0 l -2.6 1.4 Z" fill="#ffd9d1" opacity="0.85" />
          </g>
          <g transform="translate(244,34)">
            <g style={A("breathe 3.6s ease-in-out infinite", "center")}>
              <Sprite name="star" size={26} />
            </g>
          </g>
          <g transform="translate(300,26)">
            <Sprite name="shell" size={22} />
          </g>
        </g>

        {/* Crab & octopus walk on as Noto Lottie overlays below; Fluent
            statics on the dry sand are the reduced-motion fallback. */}
        {isLow && reduce && (
          <>
            <g transform="translate(150,308)">
              <Sprite name="crab" size={36} />
            </g>
            <g transform="translate(304,310)">
              <Sprite name="octopus" size={34} />
            </g>
          </>
        )}

        {/* Dolphin animates as a Noto Lottie overlay below; Fluent static here
            is the reduced-motion fallback. */}
        {nearHigh && reduce && (
          <g transform="translate(300,132)">
            <Sprite name="dolphin" size={56} facing={-1} />
          </g>
        )}

        {/* Sandcastle + beach ball on the dry sand */}
        <g transform="translate(84,306)"><Sprite name="sandcastle" size={46} /></g>
        <g transform="translate(126,320)">
          <g style={A("roll 3.2s var(--ease-bob) infinite", "bottom center")}>
            <Boop who="beachball" lines={BALL_QUIPS}>
              <Sprite name="beachball" size={24} />
            </Boop>
          </g>
        </g>

        {/* Foreground palm framing the corner */}
        <g transform="translate(24,300)">
          <g style={A("sway 7s ease-in-out infinite", "bottom center")}>
            <Sprite name="palm" size={96} />
          </g>
        </g>

      </svg>

      {/* Water glints */}
      <WaterSparkles topFraction={0.46} />

      {/* Tide-direction indicator — an always-visible cue near the surfer that
          shows, at a glance, whether the water is coming in or going out. */}
      <TideDirection
        rising={rising}
        slack={now.phase === "high-slack" || now.phase === "low-slack"}
        reduce={!!reduce}
      />

      {/* Easter-egg speech bubble — pops up when you tap a critter */}
      {quip && (
        <div
          key={quip.n}
          className="pointer-events-none absolute left-1/2 top-[19%] z-10 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-white/95 px-3.5 py-1.5 text-[0.8rem] font-semibold text-[color:var(--color-ink)] shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
          style={reduce ? undefined : { animation: "quipPop 0.32s var(--ease-pop)" }}
        >
          {quip.text}
          <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-white/95" />
        </div>
      )}

      {/* Genuinely-animated Noto emoji overlays (Apache-2.0), positioned by % of
          the hero so they track the SVG scene. Skipped under reduced motion. */}
      {!reduce && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 walkon-balloon">
            <AnimatedEmoji code="1f388" label="drifting balloon" style={pos(0, 15, 12)} />
          </div>
          {nearHigh && (
            <AnimatedEmoji code="1f42c" label="leaping dolphin" style={pos(72, 41, 16)} />
          )}
          {isLow && (
            <>
              {/* Walk-ons, not residents: the crab scuttles across the
                  exposed flats and exits; the octopus ambles the other way on
                  a rarer cycle. Off-screen most of the time — that's the point. */}
              <div className="absolute inset-0 walkon-crab">
                <AnimatedEmoji code="1f980" label="crab" style={pos(0, 90, 13)} />
              </div>
              <div className="absolute inset-0 walkon-octopus">
                <AnimatedEmoji code="1f419" label="octopus" style={pos(0, 90, 12)} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// — Easter-egg quips: a little humor for the curious tapper —
const SURFER_QUIPS = [
  "Cowabunga! 🤙",
  "Totally tubular, dude 🏄",
  "Gnarly waves today 🌊",
  "Hang ten! 🤙",
  "The tide's my ride 😎",
  "Wipeout... but make it stylish 💫",
];
// Extra surfer lines at low tide — the shelling whimsy that used to be a
// persistent hint line now lives here, tap-invited (research says persistent
// character copy is the Clippy pattern; invited copy is the delightful kind).
const SURFER_LOW_TIDE_QUIPS = [
  "Prime shelling right now 🐚",
  "Tide pools are popping — go look! ⭐",
  "Found any good shells yet? 👀",
  "No waves... guess I'll beachcomb 🩴",
];
const WHALE_QUIPS = [
  "Thar she blows! 🐋",
  "I'm having a whale of a time 🐳",
  "Just here for the plankton 🍤",
  "Big fish energy 💙",
];
const TURTLE_QUIPS = [
  "Slow and steady wins the tide 🐢",
  "No rush, the ocean waits for me 🌊",
  "Shell yeah 🐢",
  "Been doing this for 100 years 🧓",
];
const BALL_QUIPS = ["Boing! 🏖️", "Wanna play? 🏐", "Don't let me float away! 🌊"];
const SUN_QUIPS = ["Feelin' toasty ☀️", "Don't forget sunscreen 🧴", "I'm a big deal 🌞"];
const LIGHTHOUSE_QUIPS = [
  "Shine on 💡",
  "Guiding sailboats since forever ⛵",
  "Best seat on the pier 🌊",
  "I never blink 👁️",
];
const SUN_SHADES_QUIPS = ["Too bright? 😎", "Now we're cool 🕶️", "Deal with it 😎"];

/** Absolute overlay position by % of the hero, centered on (leftPct, topPct). */
function pos(leftPct: number, topPct: number, widthPct: number): CSSProperties {
  return {
    position: "absolute",
    left: `${leftPct}%`,
    top: `${topPct}%`,
    width: `${widthPct}%`,
    aspectRatio: "1 / 1",
    transform: "translate(-50%, -50%)",
  };
}

/**
 * A small badge floating over the scene near the surfer: a stream of chevrons
 * flowing shoreward (up) on a rising tide or seaward (down) on the ebb, plus a
 * plain-language label and rate. The animated flow is the at-a-glance "coming
 * in / going out" cue the day-switcher couldn't give. Static under reduced motion.
 */
function TideDirection({
  rising,
  slack,
  reduce,
}: {
  rising: boolean;
  slack: boolean;
  reduce: boolean;
}) {
  const label = slack ? "Slack tide" : rising ? "Coming in" : "Going out";
  // Direction word only — the numbers (height, ft/hr) live in the chips below
  // the scene. Slack keeps its sub-line: "about to turn" is said nowhere else.
  const sub = slack
    ? rising
      ? "about to turn · was coming in"
      : "about to turn · was going out"
    : null;
  const flow = rising ? "flowUp" : "flowDown";
  // Chevron points up for incoming, down for outgoing.
  const chevron = rising ? "5,7 10,2 15,7" : "5,2 10,7 15,2";
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[5%] flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-white shadow-[0_2px_10px_rgba(0,0,0,0.18)] backdrop-blur-md"
      style={{ background: "rgba(20,42,58,0.42)" }}
    >
      <span
        className="relative inline-block"
        style={{ width: 20, height: 22 }}
        aria-hidden="true"
      >
        {slack ? (
          // calm water at the turn: two gentle swells instead of directional chevrons
          <svg width="20" height="22" viewBox="0 0 20 22" className="absolute left-0">
            <path
              d="M2 9 q2.5 -3 5 0 t5 0 t5 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={reduce ? undefined : { animation: "slackSway 2.6s ease-in-out infinite" }}
            />
            <path
              d="M2 15 q2.5 -3 5 0 t5 0 t5 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.45"
              style={reduce ? undefined : { animation: "slackSway 2.6s ease-in-out -1.3s infinite" }}
            />
          </svg>
        ) : (
          [0, 1, 2].map((i) => (
            <svg
              key={i}
              width="20"
              height="9"
              viewBox="0 0 20 9"
              className="absolute left-0"
              style={{
                top: rising ? `${i * 6}px` : `${(2 - i) * 6}px`,
                ...(reduce
                  ? { opacity: i === 1 ? 1 : 0.35 }
                  : {
                      animation: `${flow} 1.5s ease-in-out ${i * 0.22}s infinite`,
                    }),
              }}
            >
              <polyline
                points={chevron}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ))
        )}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[0.82rem] font-semibold tracking-tight">{label}</span>
        {sub && (
          <span className="text-[0.62rem] font-medium uppercase tracking-wide opacity-80">
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}

function Fish({
  x, y, size, dur, delay, facing, A, sprite,
}: {
  x: number;
  y: number;
  size: number;
  dur: number;
  delay: number;
  facing: number;
  sprite: string;
  A: (a: string, o?: string) => CSSProperties | undefined;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <g style={A(`dart ${dur}s var(--ease-glide) ${delay}s infinite`)}>
        <g style={A(`wiggle 0.42s var(--ease-swim) infinite`, "90% 50%")}>
          <Sprite name={sprite} size={size} facing={facing} />
        </g>
      </g>
    </g>
  );
}

/**
 * A closed path whose top edge is a seamless sine wave (period = VB_W), drawn
 * 2×VB_W wide so a −50% translateX loops without a seam.
 */
function waveTopPath(
  phaseShift: number,
  amp = 7,
  seg = VB_W / 2,
): string {
  const width = VB_W * 2;
  let d = `M 0 0`;
  let i = 0;
  for (let x = 0; x < width - 0.01; x += seg, i++) {
    const cx = x + seg / 2;
    const dir = i % 2 === 0 ? -1 : 1;
    d += ` Q ${cx.toFixed(1)} ${(dir * amp + Math.sin(phaseShift) * 2).toFixed(1)} ${(x + seg).toFixed(1)} 0`;
  }
  d += ` L ${width} ${VB_H} L 0 ${VB_H} Z`;
  return d;
}

/** A thin foam ribbon just under the crest, seam-looping like the waves. */
function foamPath(amp = 6, seg = VB_W / 2, thick = 4): string {
  const width = VB_W * 2;
  let d = `M 0 2`;
  let i = 0;
  for (let x = 0; x < width - 0.01; x += seg, i++) {
    const cx = x + seg / 2;
    const dir = i % 2 === 0 ? -1 : 1;
    d += ` Q ${cx.toFixed(1)} ${(dir * amp + 2).toFixed(1)} ${(x + seg).toFixed(1)} 2`;
  }
  d += ` L ${width} ${2 + thick} L 0 ${2 + thick} Z`;
  return d;
}

/**
 * Smooth rolling-hill silhouette, 2×VB_W wide for a seamless −50% loop.
 * Flat bezier handles at each crest/trough give the silky Tiny Wings roundness.
 */
function dunePath(
  baseY: number,
  amp: number,
  period: number,
  floorY: number,
): string {
  const width = VB_W * 2;
  const half = period / 2;
  let d = `M 0 ${baseY}`;
  let up = true;
  for (let x = 0; x < width; x += half) {
    const y1 = up ? baseY - amp : baseY;
    d += ` C ${x + half * 0.5} ${up ? baseY : baseY - amp} ${x + half * 0.5} ${y1} ${x + half} ${y1}`;
    up = !up;
  }
  d += ` L ${width} ${floorY} L 0 ${floorY} Z`;
  return d;
}
