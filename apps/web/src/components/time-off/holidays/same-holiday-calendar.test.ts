import { describe, expect, it } from "vite-plus/test";
import { sameHolidayCalendar } from "./same-holiday-calendar";

describe("sameHolidayCalendar", () => {
  it("matches the same country and region", () => {
    expect(
      sameHolidayCalendar(
        { country: "DE", region: "BY" },
        { country: "DE", region: "BY" },
      ),
    ).toBe(true);
  });

  it("tells regions, and a region from the whole country, apart", () => {
    expect(
      sameHolidayCalendar(
        { country: "DE", region: "BY" },
        { country: "DE", region: "BE" },
      ),
    ).toBe(false);
    expect(
      sameHolidayCalendar({ country: "DE", region: "BY" }, { country: "DE" }),
    ).toBe(false);
    expect(
      sameHolidayCalendar({ country: "DE", region: null }, { country: "DE" }),
    ).toBe(true);
  });

  it("tells countries apart", () => {
    expect(sameHolidayCalendar({ country: "DE" }, { country: "AT" })).toBe(
      false,
    );
  });

  it("treats null and a null country alike as No calendar", () => {
    expect(sameHolidayCalendar(null, { country: null, region: null })).toBe(
      true,
    );
    expect(sameHolidayCalendar(null, null)).toBe(true);
    expect(sameHolidayCalendar(null, { country: "DE" })).toBe(false);
  });
});
