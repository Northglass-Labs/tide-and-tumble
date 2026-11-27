import { describe, expect, test } from "vitest";
import noaaStations from "@/lib/noaa-stations.json";
import { sunTimes } from "@/lib/sun";
import { stationNow } from "@/lib/tides";
import { stationTimeZone } from "@/lib/time-zones";

const station = (id: string) => {
  const found = noaaStations.find((candidate) => candidate.i === id)!;
  return { lat: found.a, lng: found.o, state: found.s };
};

describe("each station's time zone", () => {
  test.each([
    ["9439040", "Astoria, OR", "America/Los_Angeles"],
    ["8729840", "Pensacola, FL (west of 85.4°W)", "America/Chicago"],
    ["8728690", "Apalachicola, FL (east of 85.4°W)", "America/New_York"],
    ["8771450", "Galveston, TX", "America/Chicago"],
    ["8651370", "Duck, NC", "America/New_York"],
    ["1612340", "Honolulu, HI", "Pacific/Honolulu"],
    ["9755371", "San Juan, PR", "America/Puerto_Rico"],
    ["1630000", "Apra Harbor, Guam", "Pacific/Guam"],
    ["9461380", "Adak Island, AK", "America/Adak"],
    ["9455920", "Anchorage, AK", "America/Anchorage"],
  ])("%s (%s) is %s", (id, _name, zone) => {
    expect(stationTimeZone(station(id))).toBe(zone);
  });

  test("every bundled station has a zone the runtime knows", () => {
    for (const candidate of noaaStations) {
      const zone = stationTimeZone({ lat: candidate.a, lng: candidate.o, state: candidate.s });
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: zone })).not.toThrow();
    }
  });

  test("a station's 'now' is its own wall clock: Astoria is three hours behind Duck, Pensacola one", () => {
    const instant = new Date(Date.UTC(2026, 10, 27, 18, 0)); // 13:00 in New York
    expect(stationNow(instant, "America/New_York")).toBe(Date.UTC(2026, 10, 27, 13, 0));
    expect(stationNow(instant, "America/Los_Angeles")).toBe(Date.UTC(2026, 10, 27, 10, 0));
    expect(stationNow(instant, "America/Chicago")).toBe(Date.UTC(2026, 10, 27, 12, 0));
  });

  test("sunrise is told in the station's own time: about 7:30 AM at Astoria in late November", () => {
    const { sunrise } = sunTimes(46.2, -123.77, new Date(Date.UTC(2026, 10, 27, 20, 0)), "America/Los_Angeles");
    expect(sunrise).toMatch(/^7:[2-4]\d AM$/);
  });
});
