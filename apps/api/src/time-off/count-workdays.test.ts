import { describe, expect, it } from "vite-plus/test";
import { countWorkdays, NO_HOLIDAYS } from "./count-workdays";

function countOneByOne(startDate: string, endDate: string) {
  let weekdays = 0;
  for (
    let day = new Date(`${startDate}T00:00:00Z`);
    day <= new Date(`${endDate}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) weekdays++;
  }
  return weekdays;
}

const count = (startDate: string, endDate: string) =>
  countWorkdays(startDate, endDate, NO_HOLIDAYS);

describe("countWorkdays", () => {
  it("counts Monday to Friday inclusively", () => {
    expect(count("2026-11-16", "2026-11-20")).toBe(5);
    expect(count("2026-11-16", "2026-11-16")).toBe(1);
    expect(count("2026-11-13", "2026-11-16")).toBe(2);
  });

  it("counts nothing for a Saturday-to-Sunday range", () => {
    expect(count("2026-11-14", "2026-11-15")).toBe(0);
    expect(count("2026-11-14", "2026-11-14")).toBe(0);
  });

  it("returns 0 when the start is after the end", () => {
    expect(count("2026-11-20", "2026-11-16")).toBe(0);
    expect(
      countWorkdays("2026-11-20", "2026-11-16", new Set(["2026-11-18"])),
    ).toBe(0);
  });

  it("counts a leap day that falls on a weekday", () => {
    expect(count("2028-02-28", "2028-03-01")).toBe(3);
    expect(count("2028-02-29", "2028-02-29")).toBe(1);
  });

  it("counts whole years", () => {
    expect(count("2026-01-01", "2026-12-31")).toBe(261);
    expect(count("2028-01-01", "2028-12-31")).toBe(260);
  });

  it("matches a day-by-day count for every start weekday and length", () => {
    for (let start = 1; start <= 7; start++) {
      for (let length = 0; length < 30; length++) {
        const startDate = `2026-03-${String(start).padStart(2, "0")}`;
        const end = new Date(`${startDate}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + length);
        const endDate = end.toISOString().slice(0, 10);
        expect(count(startDate, endDate)).toBe(
          countOneByOne(startDate, endDate),
        );
      }
    }
  });

  it("leaves out weekday holidays inside the range", () => {
    // Wednesday 2026-11-18.
    expect(
      countWorkdays("2026-11-16", "2026-11-20", new Set(["2026-11-18"])),
    ).toBe(4);
  });

  it("ignores holidays on weekends or outside the range", () => {
    expect(
      countWorkdays(
        "2026-11-16",
        "2026-11-20",
        new Set(["2026-11-14", "2026-11-21", "2026-11-23"]),
      ),
    ).toBe(5);
  });

  it("counts a holiday-only range as 0", () => {
    expect(
      countWorkdays("2027-01-01", "2027-01-01", new Set(["2027-01-01"])),
    ).toBe(0);
  });
});
