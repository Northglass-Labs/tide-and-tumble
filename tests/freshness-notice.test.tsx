/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import DataFreshnessNotice from "@/components/DataFreshnessNotice";

afterEach(cleanup);

describe("data freshness notice", () => {
  test("makes offline safety loss and saved tide data visible", () => {
    render(
      <DataFreshnessNotice
        offline
        safetyStatus="unavailable"
        tideCachedAt={1_750_000_000_000}
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(/offline/i);
    expect(screen.getByRole("status").textContent).toMatch(/saved tide predictions/i);
    expect(screen.getByRole("alert").textContent).toMatch(
      /beach safety data is unavailable/i,
    );
  });

  test("warns when server-seeded advisories could not be refreshed", () => {
    render(
      <DataFreshnessNotice
        offline={false}
        safetyStatus="stale"
        tideCachedAt={null}
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/could not be refreshed/i);
    expect(screen.getByRole("alert").textContent).toMatch(/nws|lifeguard/i);
  });

  test("stays quiet when live data is fresh", () => {
    const { container } = render(
      <DataFreshnessNotice
        offline={false}
        safetyStatus="fresh"
        tideCachedAt={null}
      />,
    );

    expect(container.textContent).toBe("");
  });
});
