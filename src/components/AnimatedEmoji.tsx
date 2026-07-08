"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

// lottie-react touches the DOM — load it client-only.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

/**
 * A genuinely-animated Google Noto emoji (Apache-2.0), self-hosted in
 * /public/emoji as Lottie JSON. Fetched on the client; renders nothing until
 * loaded (and nothing at all under prefers-reduced-motion — callers show a
 * static Fluent sprite instead).
 */
export default function AnimatedEmoji({
  code,
  label,
  className,
  style,
}: {
  code: string;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/emoji/${code}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!data) return null;
  return (
    <Lottie
      animationData={data}
      loop
      autoplay
      role="img"
      aria-label={label}
      className={className}
      style={style}
    />
  );
}
