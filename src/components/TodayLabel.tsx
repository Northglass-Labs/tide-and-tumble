"use client";

import { useSyncExternalStore } from "react";
import { fmtDayLabel, stationNow } from "@/lib/tides";

const noSubscription = () => () => {};

/**
 * "Fri, Nov 27" for the station's today. The static page carries the day it
 * was built (`built`); the browser shows the real one.
 */
export default function TodayLabel({ built, timeZone }: { built: string; timeZone: string }) {
  const label = useSyncExternalStore(
    noSubscription,
    () => fmtDayLabel(stationNow(new Date(), timeZone)),
    () => built,
  );
  return <>{label}</>;
}
