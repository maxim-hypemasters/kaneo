import { describe, expect, it } from "vite-plus/test";
import { sameHolidayCalendar } from "./same-holiday-calendar";

describe("sameHolidayCalendar", () => {
  it("matches equal country and region", () => {
    expect(
      sameHolidayCalendar(
        { country: "DE", region: "BY" },
        { country: "DE", region: "BY" },
      ),
    ).toBe(true);
    expect(
      sameHolidayCalendar(
        { country: "DE", region: null },
        { country: "DE", region: null },
      ),
    ).toBe(true);
  });

  it("tells apart another country or region", () => {
    expect(
      sameHolidayCalendar(
        { country: "DE", region: "BY" },
        { country: "DE", region: null },
      ),
    ).toBe(false);
    expect(
      sameHolidayCalendar(
        { country: "DE", region: null },
        { country: "FR", region: null },
      ),
    ).toBe(false);
  });

  it("treats no calendar as equal only to no calendar", () => {
    expect(sameHolidayCalendar(null, null)).toBe(true);
    expect(sameHolidayCalendar(null, { country: "DE", region: null })).toBe(
      false,
    );
    expect(sameHolidayCalendar({ country: "DE", region: null }, null)).toBe(
      false,
    );
  });
});
