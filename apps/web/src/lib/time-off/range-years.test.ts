import { expect, it } from "vite-plus/test";
import { rangeYears } from "./range-years";

it("lists every year the range touches", () => {
  expect(rangeYears("2026-11-16", "2026-11-20")).toEqual([2026]);
  expect(rangeYears("2026-12-28", "2027-01-08")).toEqual([2026, 2027]);
});

it("returns nothing for a reversed range", () => {
  expect(rangeYears("2027-01-02", "2026-12-30")).toEqual([]);
});
