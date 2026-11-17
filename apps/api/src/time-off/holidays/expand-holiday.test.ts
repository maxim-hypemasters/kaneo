import { describe, expect, it } from "vite-plus/test";
import { holidayDates } from "./expand-holiday";

const at = (iso: string) => new Date(iso);

describe("holidayDates", () => {
  it("returns the civil day of a one-day holiday", () => {
    // Berlin, UTC+1: the local day starts the evening before in UTC.
    expect(
      holidayDates({
        date: "2027-01-01 00:00:00",
        start: at("2026-12-31T23:00:00Z"),
        end: at("2027-01-01T23:00:00Z"),
      }),
    ).toEqual(["2027-01-01"]);
  });

  it("expands a three-day holiday", () => {
    expect(
      holidayDates({
        date: "2027-03-09 00:00:00 -0600",
        start: at("2027-03-08T14:00:00Z"),
        end: at("2027-03-11T14:00:00Z"),
      }),
    ).toEqual(["2027-03-09", "2027-03-10", "2027-03-11"]);
  });

  it("keeps 23 and 25 hour DST days to one date", () => {
    expect(
      holidayDates({
        date: "2027-03-28 00:00:00",
        start: at("2027-03-27T23:00:00Z"),
        end: at("2027-03-28T22:00:00Z"),
      }),
    ).toEqual(["2027-03-28"]);
    expect(
      holidayDates({
        date: "2027-10-31 00:00:00",
        start: at("2027-10-30T22:00:00Z"),
        end: at("2027-10-31T23:00:00Z"),
      }),
    ).toEqual(["2027-10-31"]);
  });

  it("counts an afternoon start ending at midnight as one date", () => {
    expect(
      holidayDates({
        date: "2027-12-24 14:00:00",
        start: at("2027-12-24T13:00:00Z"),
        end: at("2027-12-24T23:00:00Z"),
      }),
    ).toEqual(["2027-12-24"]);
  });

  it("counts an afternoon start ending two days later at midnight as two dates", () => {
    expect(
      holidayDates({
        date: "2027-12-24 14:00:00",
        start: at("2027-12-24T13:00:00Z"),
        end: at("2027-12-25T23:00:00Z"),
      }),
    ).toEqual(["2027-12-24", "2027-12-25"]);
  });

  it("crosses a year boundary", () => {
    expect(
      holidayDates({
        date: "2026-12-31 00:00:00",
        start: at("2026-12-30T23:00:00Z"),
        end: at("2027-01-01T23:00:00Z"),
      }),
    ).toEqual(["2026-12-31", "2027-01-01"]);
  });
});
