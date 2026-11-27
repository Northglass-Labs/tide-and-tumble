/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import BeachTideTable from "@/components/BeachTideTable";
import { BEACHES } from "@/lib/slugs";
import { TABLE_UNAVAILABLE } from "../../scripts/lib/build-output.mjs";

afterEach(cleanup);

describe("BeachTideTable", () => {
  test("marks the page when the build had no tide table, so a release can refuse to ship it", () => {
    const beach = BEACHES[0]!;
    const { container } = render(<BeachTideTable beach={beach} initialWeek={null} days={30} />);
    expect(container.innerHTML).toContain(TABLE_UNAVAILABLE);
  });
});
