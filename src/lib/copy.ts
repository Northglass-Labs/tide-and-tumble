import type { Phase, TideNow } from "./tides";

// Playful-but-honest status lines. Multiple per state so it never feels robotic.
const LINES: Record<string, string[]> = {
  "rising-early": [
    "The tide is rolling in 🌊",
    "Here comes the water 🌊",
    "Flood tide — the sea's on its way back 💙",
    "The ocean's coming back for seconds 🍽️",
  ],
  "rising-strong": [
    "Water's climbing fast — paddle out! 🏄",
    "Big push of water coming in 🌊",
    "Tide's racing in — hold onto your sandcastle 🏰",
    "The sea skipped leg day but not tide day 💪",
  ],
  "approaching-high": [
    "Almost high tide — the sea's showing off 🐬",
    "Nearly full — the ocean's stretching to shore 🌊",
    "The tide is *this* close to peak drama 🎭",
  ],
  "high-slack": [
    "High and full. The ocean's taking a breath 😮‍💨",
    "Peak tide — everything's afloat 🐢",
    "High tide o'clock. The sea has fully committed 💯",
  ],
  "falling-early": [
    "Tide's slipping out to sea 🐚",
    "The water's starting to pull back 🌾",
    "Ebb tide — the beach is waking up 🦀",
    "The ocean's leaving, but it'll text you later 📱",
  ],
  "falling-strong": [
    "Ebbing quick — the beach is getting bigger 🦀",
    "Water's draining out fast — more sand for you 🏖️",
    "Strong ebb — tide pools on the way ⭐",
    "The sea pulled the plug ⚡ more beach for everyone",
  ],
  "approaching-low": [
    "Low tide's coming — grab your bucket 🪣",
    "Almost bottomed out — shell time soon 🐚",
    "The ocean's almost done exhaling 😌",
  ],
  "low-slack": [
    "Low tide! Go find some shells and tide pools ⭐",
    "Dead low — the ocean's laid out its treasures 🐚",
    "Lowest water — perfect for a long beach walk 🩴",
    "Low tide: the sea's yard-sale is open 🐚",
  ],
};

function stateKey(now: TideNow, atMs: number): string {
  const { phase, rate, direction } = now;
  if (phase === "high-slack") return "high-slack";
  if (phase === "low-slack") return "low-slack";

  // Where we are between the surrounding extrema (0 = just left one, 1 = at next).
  let frac = 0.5;
  if (now.prevExtremum && now.nextExtremum) {
    const span = now.nextExtremum.time - now.prevExtremum.time;
    if (span > 0) frac = (atMs - now.prevExtremum.time) / span;
  }
  const fast = Math.abs(rate) > 0.9;

  if (direction === "rising") {
    if (frac > 0.8) return "approaching-high";
    if (frac < 0.3) return "rising-early";
    return fast ? "rising-strong" : "rising-early";
  }
  if (frac > 0.8) return "approaching-low";
  if (frac < 0.3) return "falling-early";
  return fast ? "falling-strong" : "falling-early";
}

/** Pick a line for the current state, rotating every ~7 minutes so it feels alive but stable. */
export function statusLine(now: TideNow, atMs: number): string {
  const key = stateKey(now, atMs);
  const options = LINES[key] ?? LINES["rising-early"];
  const idx = Math.floor(atMs / (7 * 60_000)) % options.length;
  return options[idx];
}

/** Short chip label for the state. */
export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "rising":
      return "Rising";
    case "falling":
      return "Falling";
    case "high-slack":
      return "High slack";
    case "low-slack":
      return "Low slack";
  }
}

export function shellingHint(now: TideNow): string | null {
  // Best shelling is around low tide, especially the falling approach to low.
  if (now.phase === "low-slack") return "Prime shelling window right now 🐚";
  if (now.direction === "falling" && now.nextLow) {
    return "Beach is opening up — good shelling ahead 🐚";
  }
  return null;
}
