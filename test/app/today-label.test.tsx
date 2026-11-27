/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import TodayLabel from "@/components/TodayLabel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TodayLabel", () => {
  test("names the beach's own today: still Friday evening at Astoria when it is Saturday in New York", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 28, 6, 30))); // 01:30 Sat in New York, 22:30 Fri in Oregon
    expect(render(<TodayLabel built="—" timeZone="America/Los_Angeles" />).container.textContent).toBe("Fri, Nov 27");
    cleanup();
    expect(render(<TodayLabel built="—" timeZone="America/New_York" />).container.textContent).toBe("Sat, Nov 28");
  });
});
