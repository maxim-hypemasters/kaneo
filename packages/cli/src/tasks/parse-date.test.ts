import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  localDay,
  parseDateChange,
  parseDateInput,
  parseDayInput,
} from "./parse-date.js";

const now = new Date(2026, 9, 7, 23, 45);
const noon = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).toISOString();

const success = <A, E>(result: Result.Result<A, E>) =>
  Result.isSuccess(result) ? result.success : "failed";

describe("parseDateInput", () => {
  it("reads calendar days at local noon", () => {
    expect(success(parseDateInput("2026-12-24", now))).toBe(noon(2026, 12, 24));
    expect(new Date(success(parseDateInput("2026-12-24", now))).getDate()).toBe(
      24,
    );
  });

  it("reads today, tomorrow and relative days", () => {
    expect(success(parseDateInput("today", now))).toBe(noon(2026, 10, 7));
    expect(success(parseDateInput(" Tomorrow ", now))).toBe(noon(2026, 10, 8));
    expect(success(parseDateInput("+3d", now))).toBe(noon(2026, 10, 10));
    expect(success(parseDateInput("+0d", now))).toBe(noon(2026, 10, 7));
  });

  it("rolls relative days over month and year ends", () => {
    const newYearsEve = new Date(2026, 11, 31, 9);
    expect(success(parseDateInput("tomorrow", newYearsEve))).toBe(
      noon(2027, 1, 1),
    );
    expect(success(parseDateInput("+30d", newYearsEve))).toBe(
      noon(2027, 1, 30),
    );
  });

  it("rejects impossible days and other text with a hint", () => {
    for (const input of [
      "2026-02-30",
      "2026-13-01",
      "0050-01-01",
      "next week",
      "3d",
      "",
      "2026-1-5",
    ]) {
      const result = parseDateInput(input, now, "--start");
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe("InvalidArgument");
        expect(result.failure.message).toBe(
          `--start "${input}" is not a date.`,
        );
        expect(result.failure.hint).toBe(
          "Use YYYY-MM-DD, today, tomorrow, or +3d.",
        );
      }
    }
  });

  it("does not treat none as a date", () => {
    expect(Result.isFailure(parseDateInput("none", now))).toBe(true);
  });
});

describe("parseDateChange", () => {
  it("clears with none", () => {
    expect(success(parseDateChange("none", now))).toBeNull();
    expect(success(parseDateChange(" NONE ", now))).toBeNull();
  });

  it("reads the same inputs as parseDateInput", () => {
    expect(success(parseDateChange("2027-03-01", now))).toBe(noon(2027, 3, 1));
    expect(success(parseDateChange("+1d", now))).toBe(noon(2026, 10, 8));
  });

  it("mentions none in the hint", () => {
    const result = parseDateChange("soon", now, "--due");
    expect(Result.isFailure(result) && result.failure.hint).toBe(
      "Use YYYY-MM-DD, today, tomorrow, +3d, or none to clear it.",
    );
  });
});

describe("parseDayInput", () => {
  it("reads the same inputs as calendar days", () => {
    expect(success(parseDayInput("2026-12-24", now, "--start"))).toBe(
      "2026-12-24",
    );
    expect(success(parseDayInput("today", now, "--start"))).toBe("2026-10-07");
    expect(success(parseDayInput("+30d", now, "--start"))).toBe("2026-11-06");
  });

  it("rejects impossible days", () => {
    for (const input of ["2026-02-30", "2026-10-07T10:00:00Z"]) {
      const result = parseDayInput(input, now, "--code-freeze");
      expect(Result.isFailure(result) && result.failure.message).toBe(
        `--code-freeze "${input}" is not a date.`,
      );
    }
  });

  it("says a release date can't be cleared with none", () => {
    const result = parseDayInput(" None ", now, "--code-freeze");
    expect(Result.isFailure(result) && result.failure).toMatchObject({
      message: "--code-freeze needs a date: release dates can't be cleared.",
      hint: "Use YYYY-MM-DD, today, tomorrow, or +3d.",
    });
  });
});

describe("localDay", () => {
  it("pads the month and day of the local date", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
