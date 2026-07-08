"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * A tiny Canvas layer of drifting, twinkling glints over the water — cheap depth
 * & shimmer (Tiny Wings vibe). Pauses when scrolled offscreen; skipped entirely
 * under prefers-reduced-motion. `topFraction` = where the water starts (0..1).
 */
export default function WaterSparkles({
  topFraction = 0.45,
}: {
  topFraction?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const count = w < 480 ? 26 : 42;
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: 0,
      r: 0.8 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.9,
      drift: (Math.random() - 0.5) * 0.25,
    }));
    const reseedY = (p: (typeof parts)[number]) => {
      p.y = topFraction * h + Math.random() * (1 - topFraction) * h;
    };
    parts.forEach(reseedY);

    let raf = 0;
    let running = true;
    let t = 0;
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      const glint = getComputedStyle(canvas).getPropertyValue("--glint").trim() ||
        "255,255,255";
      for (const p of parts) {
        const a = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * p.speed * 2 + p.phase));
        p.y -= p.speed * 0.25;
        p.x += p.drift;
        if (p.y < topFraction * h - 6) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(${glint},${a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (running) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // Pause when the hero scrolls out of view.
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(draw);
        } else if (!e.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [reduce, topFraction]);

  if (reduce) return null;
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ ["--glint" as string]: "255,251,235" }}
      aria-hidden
    />
  );
}
