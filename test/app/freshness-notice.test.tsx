/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
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

  test("says the warnings are being checked while they load, which is what the static page holds", () => {
    render(<DataFreshnessNotice offline={false} safetyStatus="loading" tideCachedAt={null} />);
    expect(screen.getByRole("status").textContent).toContain("Checking NWS beach warnings…");
  });

  test("tells a reader without JavaScript where the beach warnings are", () => {
    // The static HTML is the loading state; without JavaScript it never changes.
    const html = renderToStaticMarkup(<DataFreshnessNotice offline={false} safetyStatus="loading" tideCachedAt={null} />);
    const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
    expect(noscript).toContain("weather.gov");
    expect(noscript).toContain("lifeguard");
  });
});
