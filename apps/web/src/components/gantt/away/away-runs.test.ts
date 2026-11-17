import { describe, expect, it } from "vite-plus/test";
import type { AwayDay } from "@/lib/time-off/away-days";
import { awayRunsByUser, runDates, runsWithin } from "./away-runs";

const rangeStart = new Date(2027, 0, 4); // Mon Jan 4
const days = (entries: Record<string, AwayDay>) =>
  new Map([["bo", new Map(Object.entries(entries))]]);
const vacation: AwayDay = { kind: "vacation" };
const away: AwayDay = { kind: "away" };

describe("awayRunsByUser", () => {
  it("indexes days from the first rendered day and merges neighbours", () => {
    const runs = awayRunsByUser(
      days({
        "2027-01-07": vacation,
        "2027-01-05": vacation,
        "2027-01-06": vacation,
        "2027-01-11": vacation,
      }),
      rangeStart,
      14,
    );
    expect(runs.get("bo")).toEqual([
      { from: 1, to: 4, kind: "vacation" },
      { from: 7, to: 8, kind: "vacation" },
    ]);
  });

  it("splits where what the day shows changes", () => {
    const runs = awayRunsByUser(
      days({
        "2027-01-05": vacation,
        "2027-01-06": { kind: "public_holiday", name: "Epiphany" },
        "2027-01-07": { kind: "public_holiday", name: "Other" },
        "2027-01-08": away,
      }),
      rangeStart,
      14,
    );
    expect(runs.get("bo")).toEqual([
      { from: 1, to: 2, kind: "vacation" },
      { from: 2, to: 3, kind: "public_holiday", name: "Epiphany" },
      { from: 3, to: 4, kind: "public_holiday", name: "Other" },
      { from: 4, to: 5, kind: "away" },
    ]);
  });

  it("keeps only the rendered days", () => {
    const runs = awayRunsByUser(
      days({
        "2027-01-03": away,
        "2027-01-04": away,
        "2027-01-17": away,
        "2027-01-18": away,
      }),
      rangeStart,
      14,
    );
    expect(runs.get("bo")).toEqual([
      { from: 0, to: 1, kind: "away" },
      { from: 13, to: 14, kind: "away" },
    ]);
    expect(
      awayRunsByUser(days({ "2027-02-01": away }), rangeStart, 14).size,
    ).toBe(0);
  });
});

describe("runsWithin", () => {
  it("clips the runs that overlap and drops the rest", () => {
    const runs = [
      { from: 0, to: 3, kind: "away" as const },
      { from: 5, to: 6, kind: "vacation" as const },
      { from: 8, to: 12, kind: "sick" as const },
    ];
    expect(runsWithin(runs, 2, 10)).toEqual([
      { from: 2, to: 3, kind: "away" },
      { from: 5, to: 6, kind: "vacation" },
      { from: 8, to: 10, kind: "sick" },
    ]);
    expect(runsWithin(runs, 3, 5)).toEqual([]);
  });
});

describe("runDates", () => {
  it("gives a run's first and last day", () => {
    expect(runDates({ from: 1, to: 4, kind: "away" }, rangeStart)).toEqual({
      startDate: "2027-01-05",
      endDate: "2027-01-07",
    });
  });
});
