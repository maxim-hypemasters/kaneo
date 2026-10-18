import { describe, expect, it } from "vite-plus/test";
import { assertReleaseDateOrder, isCalendarDay, isoDay } from "./release-dates";

describe("isCalendarDay", () => {
  it.each(["2026-10-20", "2028-02-29", "0001-01-01", "9999-12-31"])(
    "accepts %s",
    (value) => expect(isCalendarDay(value)).toBe(true),
  );

  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "2026-01-00",
    "0000-01-01",
    "2026-1-01",
    "26-01-01",
    "2026-01-01T00:00:00Z",
    "2026-01-01 ",
    "October 20, 2026",
    "",
  ])("rejects %j", (value) => expect(isCalendarDay(value)).toBe(false));
});

describe("isoDay", () => {
  it("parses a day and rejects a datetime", () => {
    expect(isoDay.parse("2026-10-20")).toBe("2026-10-20");
    expect(isoDay.safeParse("2026-10-20T10:00:00.000Z").success).toBe(false);
  });
});

describe("assertReleaseDateOrder", () => {
  it.each([
    ["2026-10-01", "2026-10-15", "2026-10-20"],
    ["2026-10-01", "2026-10-01", "2026-10-01"],
    ["2026-10-01", "2026-10-20", "2026-10-20"],
    ["2026-12-31", "2027-01-01", "2027-01-02"],
  ])("accepts %s ≤ %s ≤ %s", (startDate, codeFreezeDate, submissionDate) => {
    expect(() =>
      assertReleaseDateOrder({ startDate, codeFreezeDate, submissionDate }),
    ).not.toThrow();
  });

  it.each([
    ["2026-10-16", "2026-10-15", "2026-10-20"],
    ["2026-10-01", "2026-10-21", "2026-10-20"],
    ["2026-10-21", "2026-10-21", "2026-10-20"],
  ])(
    "rejects %s, %s, %s with a 400",
    (startDate, codeFreezeDate, submissionDate) => {
      expect(() =>
        assertReleaseDateOrder({ startDate, codeFreezeDate, submissionDate }),
      ).toThrow(
        expect.objectContaining({
          status: 400,
          message: "Dates must run start ≤ code freeze ≤ submission",
        }),
      );
    },
  );
});
