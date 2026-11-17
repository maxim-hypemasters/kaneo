import { describe, expect, it } from "vite-plus/test";
import { resolveHolidays } from "./resolve-holidays";

const de = { country: "DE", region: null };
const bavaria = { country: "DE", region: "BY" };
const dates = (list: readonly { date: string }[]) =>
  list.map((holiday) => holiday.date);

describe("resolveHolidays", () => {
  it("lists a country's public holidays with localized names", () => {
    expect(resolveHolidays(de, 2027, "de")).toContainEqual({
      date: "2027-01-01",
      name: "Neujahr",
    });
    expect(resolveHolidays(de, 2027)).toContainEqual({
      date: "2027-01-01",
      name: "New Year’s Day",
    });
  });

  it("leaves out bank holidays and other regions' days", () => {
    const days = dates(resolveHolidays(de, 2027));
    expect(days).not.toContain("2027-12-24");
    expect(days).not.toContain("2027-12-31");
    expect(days).not.toContain("2027-01-06");
  });

  it("adds a region's own holidays", () => {
    expect(dates(resolveHolidays(bavaria, 2027))).toContain("2027-01-06");
  });

  it("returns sorted, unique days inside the year", () => {
    for (const calendar of [de, bavaria, { country: "AE", region: null }]) {
      const days = dates(resolveHolidays(calendar, 2027));
      expect(days.length).toBeGreaterThan(0);
      expect(days.every((day) => day.startsWith("2027-"))).toBe(true);
      expect(days).toEqual([...new Set(days)].sort());
    }
  });

  it("expands multi-day holidays into each day", () => {
    const days = dates(resolveHolidays({ country: "AE", region: null }, 2027));
    expect(days).toEqual(
      expect.arrayContaining(["2027-03-09", "2027-03-10", "2027-03-11"]),
    );
  });

  it("returns the cached array on a second call", () => {
    expect(resolveHolidays(de, 2028, "en")).toBe(
      resolveHolidays(de, 2028, "en-GB"),
    );
  });

  it("returns nothing for unknown codes", () => {
    expect(resolveHolidays({ country: "ZZ", region: null }, 2027)).toEqual([]);
  });
});
