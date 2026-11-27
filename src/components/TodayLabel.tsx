"use client";

import { useSyncExternalStore } from "react";
import { fmtDayLabel, stationNow } from "@/lib/tides";

const noSubscription = () => () => {};

/**
 * "Fri, Nov 27" for the station's today. The static page carries the day it
 * was built (`built`); the browser shows the real one.
 */
export default function TodayLabel({ built }: { built: string }) {
  const label = useSyncExternalStore(
    noSubscription,
    () => fmtDayLabel(stationNow()),
    () => built,
  );
  return <>{label}</>;
}
