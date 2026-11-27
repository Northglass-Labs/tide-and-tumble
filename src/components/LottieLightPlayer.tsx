"use client";

// The light Lottie player only: SVG, no expression engine (no eval). A
// static named import, so the bundler drops the rest of lottie-react (the
// full player and its canvas renderer); AnimatedEmoji loads this module on
// demand. `npm run check` refuses an export that ships the full player.
export { LottieLight as default } from "lottie-react";
