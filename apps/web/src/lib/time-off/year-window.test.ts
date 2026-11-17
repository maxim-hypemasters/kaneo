import { expect, it } from "vite-plus/test";
import { yearWindow } from "./year-window";

it("spans the whole year, leap years included", () => {
  expect(yearWindow(2027)).toEqual({ from: "2027-01-01", to: "2027-12-31" });
  expect(yearWindow(2028)).toEqual({ from: "2028-01-01", to: "2028-12-31" });
});

it("pads early years to four digits", () => {
  expect(yearWindow(1)).toEqual({ from: "0001-01-01", to: "0001-12-31" });
});
