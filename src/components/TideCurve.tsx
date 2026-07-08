import type { TideDay } from "@/lib/tides";
import { fmtClock } from "@/lib/tides";

const W = 360;
const H = 170;
const PAD_TOP = 26;
const PAD_BOTTOM = 26;

/** The 24-hour tide curve with high/low pills and a pulsing "now" marker. */
export default function TideCurve({ day }: { day: TideDay }) {
  const { curve, dayMin, dayMax, extrema, now } = day;
  if (curve.length < 2) return null;

  const t0 = curve[0].time;
  const t1 = curve[curve.length - 1].time;
  const span = t1 - t0 || 1;
  const range = dayMax - dayMin || 1;
  const pad = range * 0.12;

  const x = (t: number) => ((t - t0) / span) * W;
  const y = (h: number) =>
    PAD_TOP +
    (1 - (h - (dayMin - pad)) / (range + pad * 2)) * (H - PAD_TOP - PAD_BOTTOM);

  const linePts = curve.map((p) => `${x(p.time).toFixed(1)},${y(p.height).toFixed(1)}`);
  const linePath = `M ${linePts.join(" L ")}`;
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;

  const nowX = x(day.computedFor);
  const nowY = y(now.height);

  const todayExtrema = extrema.filter((e) => e.time >= t0 && e.time <= t1);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <defs>
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-ocean)" }} stopOpacity="0.35" />
            <stop offset="100%" style={{ stopColor: "var(--color-ocean-deep)" }} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* subtle hour gridlines at 6/12/18h */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={f * W}
            y1={PAD_TOP - 6}
            x2={f * W}
            y2={H - PAD_BOTTOM}
            className="stroke-ink-soft"
            strokeWidth="0.5"
            strokeDasharray="2 4"
            opacity="0.25"
          />
        ))}

        {/* area + line */}
        <path d={areaPath} fill="url(#curveFill)" />
        <path
          d={linePath}
          className="stroke-ocean-deep"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* dim the past */}
        <rect x="0" y="0" width={nowX} height={H} className="fill-shell" opacity="0.22" />

        {/* high/low pills */}
        {todayExtrema.map((e) => {
          const ex = x(e.time);
          const ey = y(e.height);
          const isHigh = e.type === "H";
          const labelY = isHigh ? ey - 12 : ey + 16;
          return (
            <g key={e.time}>
              <circle cx={ex} cy={ey} r="3" className="fill-ocean-deep" />
              <text
                x={ex}
                y={labelY}
                textAnchor="middle"
                className="fill-ink-soft font-body"
                fontSize="8.5"
                fontWeight="700"
              >
                {isHigh ? "▲" : "▼"} {fmtClock(e.time)}
              </text>
            </g>
          );
        })}

        {/* now marker */}
        <line
          x1={nowX}
          y1={PAD_TOP - 8}
          x2={nowX}
          y2={H - PAD_BOTTOM}
          className="stroke-coral"
          strokeWidth="1.5"
        />
        <circle
          cx={nowX}
          cy={nowY}
          r="8"
          className="fill-coral [animation:pulseRing_2s_ease-out_infinite]"
          style={{ transformOrigin: `${nowX}px ${nowY}px`, transformBox: "fill-box" }}
          opacity="0.35"
        />
        <circle cx={nowX} cy={nowY} r="4.5" className="fill-coral" stroke="white" strokeWidth="1.5" />

        {/* axis labels */}
        {["12a", "6a", "12p", "6p", "12a"].map((lbl, i) => (
          <text
            key={i}
            x={(i / 4) * W}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
            className="fill-ink-soft font-body"
            fontSize="8"
            opacity="0.7"
          >
            {lbl}
          </text>
        ))}
      </svg>
    </div>
  );
}
