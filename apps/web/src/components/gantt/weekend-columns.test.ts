import { parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import {
  columnDay,
  columnShifts,
  dayColumn,
  daySpanColumns,
  nextWorkingDay,
  previousWorkingDay,
  shiftWorkingDays,
  spanLength,
} from "./weekend-columns";

const day = (iso: string) => parseISO(iso);
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Wed Sep 2, 2026.
const wednesday = day("2026-09-02");
// Sat Sep 5, 2026.
const saturday = day("2026-09-05");

describe("dayColumn", () => {
  it("is the calendar offset while weekends are shown", () => {
    expect(dayColumn(day("2026-09-09"), wednesday)).toBe(7);
  });

  it("skips weekends and gives them the next working day's column", () => {
    expect(dayColumn(day("2026-09-04"), wednesday, true)).toBe(2);
    expect(dayColumn(day("2026-09-05"), wednesday, true)).toBe(3);
    expect(dayColumn(day("2026-09-06"), wednesday, true)).toBe(3);
    expect(dayColumn(day("2026-09-07"), wednesday, true)).toBe(3);
    expect(dayColumn(day("2026-09-14"), wednesday, true)).toBe(8);
  });

  it("counts back from the first day for earlier dates", () => {
    expect(dayColumn(day("2026-09-01"), wednesday, true)).toBe(-1);
    expect(dayColumn(day("2026-08-31"), wednesday, true)).toBe(-2);
    expect(dayColumn(day("2026-08-29"), wednesday, true)).toBe(-2);
    expect(dayColumn(day("2026-08-28"), wednesday, true)).toBe(-3);
  });

  it("starts at the next Monday when the first day is a weekend", () => {
    expect(dayColumn(saturday, saturday, true)).toBe(0);
    expect(dayColumn(day("2026-09-07"), saturday, true)).toBe(0);
    expect(dayColumn(day("2026-09-08"), saturday, true)).toBe(1);
  });
});

describe("columnDay", () => {
  it("is the inverse of dayColumn for working days", () => {
    for (const start of [wednesday, saturday, day("2026-09-06")]) {
      for (let column = -12; column <= 12; column++) {
        const date = columnDay(start, column, true);
        expect(date.getDay() % 6).not.toBe(0);
        expect(dayColumn(date, start, true)).toBe(column);
      }
    }
  });

  it("is a calendar offset while weekends are shown", () => {
    expect(iso(columnDay(wednesday, 4))).toBe("2026-09-06");
  });
});

describe("working-day moves", () => {
  it("shifts over weekends, keeping the time of day", () => {
    const friday = new Date(2026, 8, 4, 13, 30);
    expect(shiftWorkingDays(friday, 1)).toEqual(new Date(2026, 8, 7, 13, 30));
    expect(shiftWorkingDays(friday, -5)).toEqual(new Date(2026, 7, 28, 13, 30));
  });

  it("finds the working day a weekend date is drawn against", () => {
    expect(iso(nextWorkingDay(day("2026-09-06")))).toBe("2026-09-07");
    expect(iso(nextWorkingDay(day("2026-09-04")))).toBe("2026-09-04");
    expect(iso(previousWorkingDay(day("2026-09-06")))).toBe("2026-09-04");
    expect(iso(previousWorkingDay(day("2026-09-07")))).toBe("2026-09-07");
  });
});

describe("daySpanColumns", () => {
  it("covers a span over a weekend without its columns", () => {
    expect(
      daySpanColumns(day("2026-09-04"), day("2026-09-08"), wednesday, true),
    ).toEqual({ from: 2, to: 5 });
  });

  it("ends a span that ends on a weekend at the Friday before", () => {
    expect(
      daySpanColumns(day("2026-09-03"), day("2026-09-06"), wednesday, true),
    ).toEqual({ from: 1, to: 3 });
  });

  it("is empty for a span on weekend days only", () => {
    const { from, to } = daySpanColumns(
      day("2026-09-05"),
      day("2026-09-06"),
      wednesday,
      true,
    );
    expect(to).toBeLessThanOrEqual(from);
  });
});

describe("spanLength", () => {
  it("counts working days between the ends", () => {
    expect(spanLength(day("2026-09-07"), day("2026-09-11"), true)).toBe(4);
    expect(spanLength(day("2026-09-04"), day("2026-09-08"), true)).toBe(2);
    expect(spanLength(day("2026-09-05"), day("2026-09-06"), true)).toBe(0);
    expect(spanLength(day("2026-09-04"), day("2026-09-08"), false)).toBe(4);
  });
});

describe("columnShifts", () => {
  it("moves each end by columns so a working week stays a working week", () => {
    expect(
      columnShifts(day("2026-09-07"), day("2026-09-11"), 3, 3, true),
    ).toEqual({ startDays: 3, endDays: 5 });
  });

  it("moves weekend ends from the working day they are drawn on", () => {
    expect(
      columnShifts(day("2026-09-05"), day("2026-09-06"), 1, 1, true),
    ).toEqual({ startDays: 3, endDays: 2 });
  });

  it("grows a span on weekend days alone from the column it is drawn on", () => {
    // Sat to Sun is drawn on Monday; its start moved a column left is Friday,
    // and its end stays on Monday.
    expect(
      columnShifts(day("2026-09-05"), day("2026-09-06"), -1, 0, true),
    ).toEqual({ startDays: -1, endDays: 1 });
  });

  it("leaves an untouched end put when the span has a working day", () => {
    // Fri 22:00 to Sat 06:00 is drawn on Friday, so it isn't weekend-only.
    expect(
      columnShifts(
        new Date(2026, 8, 4, 22),
        new Date(2026, 8, 5, 6),
        -1,
        0,
        true,
      ),
    ).toEqual({ startDays: -1, endDays: 0 });
    expect(
      columnShifts(day("2026-09-03"), day("2026-09-06"), -1, 0, true),
    ).toEqual({ startDays: -1, endDays: 0 });
  });

  it("is plain calendar days while weekends are shown", () => {
    expect(
      columnShifts(day("2026-09-07"), day("2026-09-11"), 3, -1, false),
    ).toEqual({ startDays: 3, endDays: -1 });
    expect(
      columnShifts(day("2026-09-05"), day("2026-09-06"), -1, 0, false),
    ).toEqual({ startDays: -1, endDays: 0 });
  });
});
