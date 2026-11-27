import { describe, expect, test } from "vitest";
import {
  FixedWindowRateLimiter,
  parseCoordinates,
  parseStationId,
} from "@/lib/api-guard";

describe("public API input and rate budgets", () => {
  test("strictly validates and normalizes coordinates", () => {
    expect(parseCoordinates("35.123456", "-75.987654")).toEqual({
      lat: 35.1235,
      lng: -75.9877,
    });
    expect(parseCoordinates("91", "0")).toBeNull();
    expect(parseCoordinates("0", "-181")).toBeNull();
    expect(parseCoordinates("35north", "-75")).toBeNull();
  });

  test("accepts only stations in the bundled NOAA dataset", () => {
    expect(parseStationId("8651370")).toEqual({
      id: "8651370",
      noaaId: "8651370",
    });
    expect(parseStationId("8651370-duck")).toEqual({
      id: "8651370-duck",
      noaaId: "8651370",
    });
    expect(parseStationId("8651370-arbitrary-cache-key")).toBeNull();
    expect(parseStationId("99999999")).toBeNull();
    expect(parseStationId("8651370-../../private")).toBeNull();
  });

  test("bounds per-client bursts and resets at the next window", () => {
    const limiter = new FixedWindowRateLimiter({ maxBuckets: 32 });
    const policy = { clientLimit: 2, globalLimit: 10, windowMs: 1_000 };

    expect(limiter.check("alerts", "198.51.100.10", policy, 0)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.check("alerts", "198.51.100.10", policy, 1)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.check("alerts", "198.51.100.10", policy, 2)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.check("alerts", "198.51.100.10", policy, 1_001)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });
});
