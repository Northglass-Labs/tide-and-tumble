import { describe, expect, it } from "vitest";
import { p95 } from "../../scripts/lib/p95.mjs";

describe("p95()", () => {
  it("is the 19th smallest of 20 samples", () => {
    const samples = [12, 15, 11, 250, 14, 13, 16, 18, 17, 19, 21, 20, 22, 24, 23, 25, 27, 26, 28, 900];

    // Sorted, the 19th value is 250: one slow outlier is forgiven, two are not.
    expect(p95(samples)).toBe(250);
  });

  it("is the 95th of 1 to 100, whatever order they arrive in", () => {
    const ascending = Array.from({ length: 100 }, (_, index) => index + 1);

    expect(p95(ascending)).toBe(95);
    expect(p95([...ascending].reverse())).toBe(95);
  });

  it("is the only sample when there is one", () => {
    expect(p95([42])).toBe(42);
  });

  it("does not change the list it is given", () => {
    const samples = [3, 1, 2];

    p95(samples);

    expect(samples).toEqual([3, 1, 2]);
  });

  it("throws on an empty list rather than inventing a number", () => {
    expect(() => p95([])).toThrow("at least one sample");
  });
});
