import { describe, expect, it } from "vite-plus/test";
import { ApiError } from "../errors/api-error";
import { NO_HOLIDAYS } from "./count-workdays";
import {
  assertHasWorkday,
  assertTimeOffDateOrder,
  assertTimeOffRangeLimits,
  validateTimeOffRange,
} from "./validate-time-off-range";

const today = "2026-11-14";

function errorOf(run: () => void) {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected a validation error");
}

function expectApiError(run: () => void, code: string) {
  const error = errorOf(run);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 400, code });
}

describe("assertTimeOffDateOrder", () => {
  it("accepts a single day and an ordered range", () => {
    expect(() =>
      assertTimeOffDateOrder({
        startDate: "2026-11-16",
        endDate: "2026-11-16",
      }),
    ).not.toThrow();
    expect(() =>
      assertTimeOffDateOrder({
        startDate: "2026-11-16",
        endDate: "2026-11-20",
      }),
    ).not.toThrow();
  });

  it("rejects an end before the start", () => {
    expectApiError(
      () =>
        assertTimeOffDateOrder({
          startDate: "2026-11-20",
          endDate: "2026-11-16",
        }),
      "TIME_OFF_RANGE",
    );
  });
});

describe("assertTimeOffRangeLimits", () => {
  it("accepts the edges of the window", () => {
    expect(() =>
      assertTimeOffRangeLimits(
        { startDate: "2025-01-01", endDate: "2025-01-03" },
        today,
      ),
    ).not.toThrow();
    expect(() =>
      assertTimeOffRangeLimits(
        { startDate: "2027-12-29", endDate: "2027-12-31" },
        today,
      ),
    ).not.toThrow();
  });

  it("rejects dates before last year or after next year", () => {
    expectApiError(
      () =>
        assertTimeOffRangeLimits(
          { startDate: "2024-12-31", endDate: "2025-01-03" },
          today,
        ),
      "TIME_OFF_RANGE",
    );
    expectApiError(
      () =>
        assertTimeOffRangeLimits(
          { startDate: "2027-12-31", endDate: "2028-01-03" },
          today,
        ),
      "TIME_OFF_RANGE",
    );
  });

  it("accepts 366 days and rejects 367", () => {
    expect(() =>
      assertTimeOffRangeLimits(
        { startDate: "2026-01-01", endDate: "2027-01-01" },
        today,
      ),
    ).not.toThrow();
    expectApiError(
      () =>
        assertTimeOffRangeLimits(
          { startDate: "2026-01-01", endDate: "2027-01-02" },
          today,
        ),
      "TIME_OFF_RANGE",
    );
  });

  it("leaves the working-day check to assertHasWorkday", () => {
    expect(() =>
      assertTimeOffRangeLimits(
        { startDate: "2026-11-14", endDate: "2026-11-15" },
        today,
      ),
    ).not.toThrow();
  });
});

describe("assertHasWorkday", () => {
  it("rejects a weekend-only range", () => {
    expectApiError(
      () =>
        assertHasWorkday(
          { startDate: "2026-11-14", endDate: "2026-11-15" },
          NO_HOLIDAYS,
        ),
      "TIME_OFF_NO_WEEKDAYS",
    );
  });

  it("rejects a range made only of calendar holidays and weekends", () => {
    // Friday 2027-01-01 to Sunday 2027-01-03.
    const error = errorOf(() =>
      assertHasWorkday(
        { startDate: "2027-01-01", endDate: "2027-01-03" },
        new Set(["2027-01-01"]),
      ),
    );
    expect(error).toMatchObject({
      status: 400,
      code: "TIME_OFF_NO_WEEKDAYS",
      message: "Time off must include at least one working day",
    });
  });

  it("accepts a range with a working day left", () => {
    expect(() =>
      assertHasWorkday(
        { startDate: "2027-01-01", endDate: "2027-01-04" },
        new Set(["2027-01-01"]),
      ),
    ).not.toThrow();
  });
});

describe("validateTimeOffRange", () => {
  const stored = { startDate: "2024-12-30", endDate: "2025-01-03" };

  it("applies every check to a new range", () => {
    expectApiError(() => validateTimeOffRange(stored, today), "TIME_OFF_RANGE");
    expect(() =>
      validateTimeOffRange(
        { startDate: "2026-11-16", endDate: "2026-11-20" },
        today,
      ),
    ).not.toThrow();
  });

  it("skips the limits when an edit keeps the dates", () => {
    expect(() =>
      validateTimeOffRange({ ...stored }, today, stored),
    ).not.toThrow();
  });

  it("applies the limits when an edit changes a date", () => {
    expectApiError(
      () =>
        validateTimeOffRange(
          { ...stored, endDate: "2025-01-02" },
          today,
          stored,
        ),
      "TIME_OFF_RANGE",
    );
  });

  it("always checks the order of the merged dates", () => {
    expectApiError(
      () =>
        validateTimeOffRange(
          { startDate: "2026-11-20", endDate: "2026-11-16" },
          today,
          { startDate: "2026-11-20", endDate: "2026-11-16" },
        ),
      "TIME_OFF_RANGE",
    );
  });
});
