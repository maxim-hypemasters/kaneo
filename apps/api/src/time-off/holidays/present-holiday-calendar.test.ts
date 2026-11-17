import { describe, expect, it } from "vite-plus/test";
import { presentHolidayCalendar } from "./present-holiday-calendar";

describe("presentHolidayCalendar", () => {
  it("adds country and region names in the language", () => {
    expect(
      presentHolidayCalendar({ country: "DE", region: "BY" }, "de"),
    ).toEqual({
      country: "DE",
      countryName: "Deutschland",
      region: "BY",
      regionName: "Bayern",
    });
  });

  it("names a whole-country calendar and falls back to unknown codes", () => {
    expect(presentHolidayCalendar({ country: "DE", region: null })).toEqual({
      country: "DE",
      countryName: "Germany",
      region: null,
      regionName: null,
    });
    expect(presentHolidayCalendar({ country: "ZZ", region: "Q1" })).toEqual({
      country: "ZZ",
      countryName: "ZZ",
      region: "Q1",
      regionName: "Q1",
    });
  });

  it("returns null without a calendar", () => {
    expect(presentHolidayCalendar(null)).toBeNull();
  });
});
