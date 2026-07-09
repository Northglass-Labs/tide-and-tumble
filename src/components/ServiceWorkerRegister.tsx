"use client";

import { useEffect } from "react";

/** Registers the offline service worker (public/sw.js). No-op if unsupported. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
