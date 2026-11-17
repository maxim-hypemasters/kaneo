import { expect, it } from "vite-plus/test";
import { NO_HOLIDAYS } from "./count-workdays";
import { workdaysByYear } from "./workdays-by-year";

it("splits a range across the new year", () => {
  expect(workdaysByYear("2026-12-28", "2027-01-08", NO_HOLIDAYS)).toEqual([
    { year: 2026, days: 4 },
    { year: 2027, days: 6 },
  ]);
});

it("leaves out a year touched only on a weekend", () => {
  // Jan 1 2028 is a Saturday.
  expect(workdaysByYear("2027-12-30", "2028-01-02", NO_HOLIDAYS)).toEqual([
    { year: 2027, days: 2 },
  ]);
});

it("returns nothing for a reversed or weekend-only range", () => {
  expect(workdaysByYear("2026-11-20", "2026-11-16", NO_HOLIDAYS)).toEqual([]);
  expect(workdaysByYear("2026-11-14", "2026-11-15", NO_HOLIDAYS)).toEqual([]);
});

it("leaves out holidays, and a year touched only on a holiday", () => {
  // Jan 1 2027 is a Friday.
  const holidays = new Set(["2026-12-28", "2027-01-01"]);
  expect(workdaysByYear("2026-12-28", "2027-01-08", holidays)).toEqual([
    { year: 2026, days: 3 },
    { year: 2027, days: 5 },
  ]);
  expect(workdaysByYear("2026-12-31", "2027-01-03", holidays)).toEqual([
    { year: 2026, days: 1 },
  ]);
});
