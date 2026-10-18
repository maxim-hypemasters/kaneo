import { describe, expect, it } from "vite-plus/test";
import {
  isProgressTimeZone,
  nextProgressDay,
  progressDay,
} from "./progress-day";
import { releaseProgressQuery } from "./response";

describe("progress calendar days", () => {
  it("validates named timezones and defaults to UTC", () => {
    expect(releaseProgressQuery.parse({}).timeZone).toBe("UTC");
    for (const zone of [
      "UTC",
      "Europe/Belgrade",
      "America/New_York",
      "Pacific/Kiritimati",
    ])
      expect(isProgressTimeZone(zone)).toBe(true);
    for (const zone of ["", "not/a-zone", "+01:00"])
      expect(isProgressTimeZone(zone)).toBe(false);
  });
  it("assigns midnight boundaries to the viewer's day", () => {
    const instant = new Date("2026-10-18T23:30:00Z");
    expect(progressDay(instant, "Europe/Belgrade")).toBe("2026-10-19");
    expect(progressDay(instant, "America/New_York")).toBe("2026-10-18");
  });
  it("advances dates across DST and leap days without skipping a date", () => {
    expect(nextProgressDay("2026-03-29")).toBe("2026-03-30");
    expect(nextProgressDay("2026-10-25")).toBe("2026-10-26");
    expect(nextProgressDay("2028-02-28")).toBe("2028-02-29");
    expect(nextProgressDay("2026-12-31")).toBe("2027-01-01");
  });
});
