import { describe, expect, it } from "vite-plus/test";
import { visibleHolidays } from "./visible-holidays";

const byUser = new Map([
  [
    "me",
    [
      { date: "2027-01-01", name: "New Year" },
      { date: "2027-01-06", name: "Epiphany" },
    ],
  ],
  [
    "amy",
    [
      { date: "2026-12-25", name: "Christmas" },
      { date: "2027-01-01", name: "New Year" },
    ],
  ],
]);
const window = { from: "2027-01-01", to: "2027-01-31" };

describe("visibleHolidays", () => {
  it("names only your own holidays for members", () => {
    expect(
      visibleHolidays(byUser, { userId: "me", canApprove: false }, window),
    ).toEqual([
      { userId: "amy", date: "2027-01-01" },
      { userId: "me", date: "2027-01-01", name: "New Year" },
      { userId: "me", date: "2027-01-06", name: "Epiphany" },
    ]);
  });

  it("names everyone's holidays for approvers", () => {
    expect(
      visibleHolidays(byUser, { userId: "boss", canApprove: true }, window),
    ).toEqual([
      { userId: "amy", date: "2027-01-01", name: "New Year" },
      { userId: "me", date: "2027-01-01", name: "New Year" },
      { userId: "me", date: "2027-01-06", name: "Epiphany" },
    ]);
  });

  it("keeps only days inside the window, both ends included", () => {
    expect(
      visibleHolidays(
        byUser,
        { userId: "me", canApprove: false },
        { from: "2026-12-25", to: "2026-12-25" },
      ),
    ).toEqual([{ userId: "amy", date: "2026-12-25" }]);
    expect(
      visibleHolidays(
        byUser,
        { userId: "me", canApprove: false },
        { from: "2027-02-01", to: "2027-02-28" },
      ),
    ).toEqual([]);
  });
});
