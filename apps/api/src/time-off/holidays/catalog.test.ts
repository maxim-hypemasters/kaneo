import { describe, expect, it } from "vite-plus/test";
import {
  holidayCalendarNames,
  isValidHolidayCalendar,
  listHolidayCountries,
  listHolidayRegions,
} from "./catalog";

describe("listHolidayCountries", () => {
  it("names countries in the requested language", () => {
    expect(listHolidayCountries("en")).toContainEqual({
      code: "DE",
      name: "Germany",
    });
    expect(listHolidayCountries("de-DE")).toContainEqual({
      code: "DE",
      name: "Deutschland",
    });
  });

  it("defaults to English and sorts by name", () => {
    const countries = listHolidayCountries();
    expect(countries).toContainEqual({ code: "DE", name: "Germany" });
    const names = countries.map((country) => country.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("returns the cached list on a second call", () => {
    expect(listHolidayCountries("fr")).toBe(listHolidayCountries("fr-FR"));
  });
});

describe("listHolidayRegions", () => {
  it("lists a country's subdivisions", () => {
    expect(listHolidayRegions("DE", "de")).toContainEqual({
      code: "BY",
      name: "Bayern",
    });
  });

  it("returns null for an unknown country", () => {
    expect(listHolidayRegions("ZZ")).toBeNull();
    expect(listHolidayRegions("de")).toBeNull();
  });
});

describe("isValidHolidayCalendar", () => {
  it("accepts a known country, with or without a known region", () => {
    expect(isValidHolidayCalendar({ country: "DE", region: "BY" })).toBe(true);
    expect(isValidHolidayCalendar({ country: "DE", region: null })).toBe(true);
  });

  it("rejects unknown or lowercase codes", () => {
    expect(isValidHolidayCalendar({ country: "DE", region: "XX" })).toBe(false);
    expect(isValidHolidayCalendar({ country: "ZZ", region: null })).toBe(false);
    expect(isValidHolidayCalendar({ country: "de", region: null })).toBe(false);
    expect(isValidHolidayCalendar({ country: "DE", region: "by" })).toBe(false);
    expect(
      isValidHolidayCalendar({ country: "constructor", region: null }),
    ).toBe(false);
  });
});

describe("holidayCalendarNames", () => {
  it("names the country and region", () => {
    expect(holidayCalendarNames({ country: "DE", region: "BY" }, "en")).toEqual(
      { countryName: "Germany", regionName: "Bayern" },
    );
    expect(holidayCalendarNames({ country: "DE", region: null })).toEqual({
      countryName: "Germany",
      regionName: null,
    });
  });

  it("falls back to codes the dataset no longer knows", () => {
    expect(holidayCalendarNames({ country: "ZZ", region: "QQ" })).toEqual({
      countryName: "ZZ",
      regionName: "QQ",
    });
  });
});
