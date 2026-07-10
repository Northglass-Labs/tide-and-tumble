"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { TideNow } from "@/lib/tides";
import Sprite from "./Sprite";
import Surfer from "./Surfer";
import Gull from "./Gull";
import WaterSparkles from "./WaterSparkles";
import AnimatedEmoji from "./AnimatedEmoji";

const VB_W = 400;
const VB_H = 340;
const WATER_TOP_HIGH = 96; // level = 1 (full)
const WATER_TOP_LOW = 250; // level = 0 (empty)
const SAND_Y = 300;

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

  const waterTop = WATER_TOP_LOW - level * (WATER_TOP_LOW - WATER_TOP_HIGH);
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

        {/* Parallax dune silhouettes on the horizon (far → near) */}
        <g style={{ ...A("wave 200s linear infinite"), filter: "blur(1.4px)", opacity: 0.8 }}>
          <path d={dunePath(120, 14, 300, 172)} fill="url(#duneFar)" />
        </g>
        <g style={{ ...A("wave 120s linear infinite"), filter: "blur(0.5px)", opacity: 0.9 }}>
          <path d={dunePath(132, 18, 240, 182)} fill="url(#duneMid)" />
        </g>
        <g style={A("wave 70s linear infinite")}>
          <path d={dunePath(144, 22, 190, 194)} fill="url(#duneNear)" />
        </g>

        {/* The beach — a sand bank running from the dune line all the way to
            the sea floor, BEHIND the water. As the tide falls, the water slides
            down this bank and real sand appears (no more sky-void seam). */}
        <path
          d={`M 0 198 Q 60 191 140 195 T 280 193 T ${VB_W} 196 L ${VB_W} ${VB_H} L 0 ${VB_H} Z`}
          fill="url(#beach)"
        />
        {/* Beach detail on the flats: tide pools that emerge at low water,
            plus pebbles and a couple of shells. Underwater they read as
            seabed texture; exposed they make low tide worth the walk. */}
        <g aria-hidden="true">
          <ellipse cx="92" cy="236" rx="26" ry="6.5" className="fill-seafoam" opacity="0.5" />
          <ellipse cx="92" cy="236" rx="18" ry="4" fill="url(#water)" opacity="0.55" />
          <ellipse cx="296" cy="244" rx="20" ry="5" className="fill-seafoam" opacity="0.45" />
          <ellipse cx="296" cy="244" rx="13" ry="3" fill="url(#water)" opacity="0.5" />
          <ellipse cx="180" cy="228" rx="4" ry="1.8" className="fill-sand-deep" opacity="0.75" />
          <ellipse cx="214" cy="240" rx="3" ry="1.4" className="fill-sand-deep" opacity="0.6" />
          <ellipse cx="330" cy="226" rx="3.4" ry="1.5" className="fill-sand-deep" opacity="0.7" />
          {/* two tiny shells */}
          <path d="M 148 246 a 3 3 0 0 1 6 0 l -3 1.6 Z" fill="#f7ede0" opacity="0.9" />
          <path d="M 252 231 a 2.6 2.6 0 0 1 5.2 0 l -2.6 1.4 Z" fill="#ffd9d1" opacity="0.85" />
        </g>
        {/* Sea-floor band (deepest sand, stays underwater) */}
        <rect x="0" y={SAND_Y} width={VB_W} height={VB_H - SAND_Y} className="fill-sand" />
        <rect x="0" y={SAND_Y} width={VB_W} height="7" className="fill-sand-deep opacity-60" />

        {/* Coral + Kenney seaweed rooted on the sand, swaying from the base */}
        <g transform="translate(112,286)">
          <g style={A("sway 5s ease-in-out infinite", "bottom center")}>
            <Sprite name="coral" size={48} />
          </g>
        </g>
        <g transform="translate(88,290)">
          <g style={A("sway 4.4s ease-in-out -1s infinite", "bottom center")}>
            <Sprite name="kenney_seaweed_green" size={40} />
          </g>
        </g>
        <g transform="translate(320,288)">
          <g style={A("sway 6s ease-in-out infinite reverse", "bottom center")}>
            <Sprite name="coral" size={40} />
          </g>
        </g>
        <g transform="translate(346,291)">
          <g style={A("sway 5.2s ease-in-out -2s infinite reverse", "bottom center")}>
            <Sprite name="kenney_seaweed_pink" size={34} />
          </g>
        </g>
        {/* Kenney rocks nestled on the sea floor */}
        <g transform="translate(160,297)"><Sprite name="kenney_rock" size={30} /></g>
        <g transform="translate(298,299)"><Sprite name="kenney_rock" size={22} facing={-1} /></g>

        {/* Water body — level animates via CSS transition; translucent for depth */}
        <g
          style={{
            transform: `translateY(${waterTop}px)`,
            transition: reduce ? undefined : "transform 1.4s var(--ease-glide)",
          }}
        >
          {/* Wet-sand edge — the dark damp band right where the water meets
              the beach. It rides (and tweens) with the water group; opacity
              fades it out when the waterline is up over the dunes at high
              tide, where a "wet sand" line would make no sense. */}
          <rect
            x="0"
            y="-7"
            width={VB_W}
            height="9"
            className="fill-sand-deep"
            style={{
              opacity: Math.max(0, Math.min(1, (waterTop - 196) / 20)) * 0.55,
              transition: reduce ? undefined : "opacity 1.4s var(--ease-glide)",
            }}
          />
          {/* — Ocean surface, back to front —
              A back-swell peeks above the crest moving the OPPOSITE way, the
              main body rolls with a shorter open-water wavelength, and a bright
              foam scallop + drifting flecks ride the crest. Cross-moving layers
              are what make it read as ocean swell instead of a lake. */}
          <g transform="translate(0,-5)" style={{ ...A("wave 16s linear infinite reverse"), opacity: 0.5 }}>
            <path d={waveTopPath(2, 6, VB_W / 3)} className="fill-seafoam" />
          </g>
          <g style={A("wave 8s linear infinite")} opacity="0.95">
            <path d={waveTopPath(0, 5.5, VB_W / 4)} fill="url(#water)" />
          </g>
          <g transform="translate(0,10)" style={{ ...A("wave 5.5s linear infinite"), opacity: 0.35 }}>
            <path d={waveTopPath(14, 4.5, VB_W / 4)} className="fill-seafoam" />
          </g>
          {/* Foam scallop hugging the crest + broken foam flecks below it */}
          <g style={{ ...A("wave 9.5s linear infinite"), opacity: 0.75 }}>
            <path d={foamPath(5, VB_W / 4, 3.2)} className="fill-white ocean-foam-bio" />
          </g>
          <g style={{ ...A("wave 7s linear infinite"), opacity: 0.45 }}>
            {[30, 150, 265, 420, 545, 660].map((fx, i) => (
              <rect key={fx} x={fx} y={7 + (i % 3) * 3} width={14 + (i % 3) * 6} height="2.4" rx="1.2" fill="#ffffff" className="ocean-foam-bio" />
            ))}
          </g>
          {/* Whitecaps winking across open water */}
          {[
            [70, 16, 0],
            [180, 24, -2.4],
            [305, 14, -4.8],
            [355, 30, -7.2],
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
          {/* Deep swell shadows — slow internal texture so the body isn't flat */}
          <g transform="translate(0,30)" style={{ ...A("wave 26s linear infinite"), opacity: 0.16 }}>
            <path d={waveTopPath(1, 9, VB_W / 2)} className="fill-ocean-deep" />
          </g>
          <g transform="translate(0,62)" style={{ ...A("wave 38s linear infinite reverse"), opacity: 0.12 }}>
            <path d={waveTopPath(3, 11, VB_W / 2)} className="fill-ocean-abyss" />
          </g>

          {/* Ambient jellyfish, pulsing */}
          <g transform="translate(64,70)">
            <g style={A("bob 5s var(--ease-bob) infinite")}>
              <g style={A("pulse 2.6s var(--ease-pop) infinite", "center top")}>
                <Sprite name="jellyfish" size={32} />
              </g>
            </g>
          </g>

          {/* A whale glides deep only on a good high tide — tap to hear it */}
          {level > 0.74 && (
            <g transform="translate(250,150)">
              <g style={A("whaleGlide 20s var(--ease-swim) infinite")}>
                <Boop who="whale" lines={WHALE_QUIPS}>
                  <Sprite name="whale" size={72} facing={facing} />
                </Boop>
              </g>
            </g>
          )}

          {/* Fish school — each darts (burst-then-coast) with a wiggling tail, staggered */}
          <Fish x={300} y={52} size={30} dur={5.2} delay={0} facing={facing} A={A} sprite="tropical_fish" />
          <Fish x={268} y={74} size={24} dur={5.9} delay={-1.6} facing={facing} A={A} sprite="fish" />
          {/* Kenney reef fish, brighter, mingling with the school */}
          <Fish x={150} y={112} size={28} dur={6.8} delay={-0.8} facing={kenneyFacing} A={A} sprite="kenney_fish_blue" />
          {/* Swim-by visitors: cross the whole scene, then gone for a while.
              The transform attribute parks them off-screen — the CSS traversal
              overrides it whenever motion is allowed (gull pattern). */}
          <g transform="translate(440,0)" style={A("swimAcrossL 34s linear infinite")}>
            <g transform="translate(0,88)">
              <Sprite name="fish" size={20} facing={1} />
            </g>
          </g>
          <g transform="translate(-60,0)" style={A("swimAcrossR 52s linear 9s infinite")}>
            <g transform="translate(0,116)">
              <Sprite name="kenney_fish_red" size={22} facing={1} />
            </g>
          </g>

          {/* Bubble streams drifting up toward the surface */}
          {!reduce && (
            <>
              {[
                { x: 160, y: 150, d: 0 },
                { x: 164, y: 150, d: -1.4 },
                { x: 298, y: 150, d: -0.7 },
                { x: 302, y: 150, d: -2.1 },
              ].map((b, i) => (
                <circle
                  key={i}
                  cx={b.x}
                  cy={b.y}
                  r={1.6 + (i % 2)}
                  fill="#ffffff"
                  style={{ animation: `rise ${3.4 + (i % 3) * 0.6}s ease-in ${b.d}s infinite` }}
                />
              ))}
            </>
          )}

          {/* Turtle — slow inbound glide + bob — tap for turtle wisdom */}
          <g transform="translate(120,44)">
            <g style={A("dart 11s var(--ease-glide) infinite")}>
              <g style={A("bob 4s var(--ease-bob) infinite")}>
                <Boop who="turtle" lines={TURTLE_QUIPS}>
                  <Sprite name="turtle" size={52} facing={facing} />
                </Boop>
              </g>
            </g>
          </g>

          {/* Surfer — our hand-drawn character. Carves the surface with board
              spray on a moving tide; mellows out (no spray, slow carve) on
              slack water. Tap for surf slang. */}
          <g transform="translate(206,8)">
            <g style={A("bob 3s var(--ease-bob) infinite")}>
              <Boop
                who="surfer"
                lines={isLow ? [...SURFER_QUIPS, ...SURFER_LOW_TIDE_QUIPS] : SURFER_QUIPS}
              >
                <Surfer
                  size={62}
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

          {/* Sailboat drifting on the far surface, rocking */}
          <g transform="translate(340,4)">
            <g style={A("bob 5s var(--ease-bob) infinite")}>
              <g style={A("surf 6s var(--ease-swim) infinite", "bottom center")}>
                <Sprite name="sailboat" size={40} />
              </g>
            </g>
          </g>
        </g>

        {/* Low-tide treasures on the exposed sand */}
        {isLow && (
          <>
            <ellipse cx="205" cy={SAND_Y + 20} rx="46" ry="9" className="fill-seafoam opacity-50" />
            {/* Crab & octopus animate as Noto Lottie overlays below; Fluent
                statics here are the reduced-motion fallback. */}
            {reduce && (
              <>
                <g transform={`translate(150,${SAND_Y + 14})`}>
                  <Sprite name="crab" size={40} />
                </g>
                <g transform={`translate(304,${SAND_Y + 16})`}>
                  <Sprite name="octopus" size={38} />
                </g>
              </>
            )}
            <g transform={`translate(250,${SAND_Y + 20})`}>
              <g style={A("breathe 3.6s ease-in-out infinite", "center")}>
                <Sprite name="star" size={30} />
              </g>
            </g>
            <g transform={`translate(300,${SAND_Y + 22})`}>
              <Sprite name="shell" size={26} />
            </g>
          </>
        )}

        {/* Dolphin animates as a Noto Lottie overlay below; Fluent static here
            is the reduced-motion fallback. */}
        {nearHigh && reduce && (
          <g transform={`translate(300,${WATER_TOP_HIGH + 8})`}>
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

        {/* Lighthouse standing on the far headland, its beacon slowly sweeping */}
        <g transform="translate(370,296)">
          {/* Beam: two opposite soft cones rotating from the lantern */}
          <g transform="translate(0,-22)" style={{ mixBlendMode: "screen" }}>
            <g style={A("beacon 9s linear infinite", "center")}>
              <polygon points="0,0 150,-30 150,30" fill="url(#beam)" />
              <polygon points="0,0 -150,-30 -150,30" fill="url(#beam)" />
            </g>
          </g>
          <Sprite name="lighthouse" size={80} />
        </g>
      </svg>

      {/* Water glints */}
      <WaterSparkles topFraction={0.42} />

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
            <AnimatedEmoji code="1f42c" label="leaping dolphin" style={pos(75, 25, 20)} />
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
