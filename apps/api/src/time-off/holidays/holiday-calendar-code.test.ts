import { describe, expect, it } from "vite-plus/test";
import { holidayCalendarCode } from "./holiday-calendar-code";

describe("holidayCalendarCode", () => {
  it("reads a country and region", () => {
    expect(holidayCalendarCode({ country: "DE", region: "BY" })).toEqual({
      country: "DE",
      region: "BY",
    });
  });

  it("reads a null country as no calendar", () => {
    expect(holidayCalendarCode({ country: null, region: null })).toBeNull();
  });
});
