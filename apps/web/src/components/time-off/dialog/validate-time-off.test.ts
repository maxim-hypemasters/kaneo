import { describe, expect, it } from "vite-plus/test";
import { SELF, type TimeOffFormValues } from "./time-off-form-values";
import { timeOffWindow, validateTimeOff } from "./validate-time-off";

const today = "2026-11-14";
const valid: TimeOffFormValues = {
  type: "vacation",
  startDate: "2026-11-16",
  endDate: "2026-11-20",
  note: "",
  member: SELF,
};

describe("validateTimeOff", () => {
  it("accepts a working day range, a single day included", () => {
    expect(validateTimeOff(valid, { today })).toEqual({});
    expect(
      validateTimeOff(
        { ...valid, startDate: "2026-11-16", endDate: "2026-11-16" },
        { today },
      ),
    ).toEqual({});
  });

  it("asks for both days and a member", () => {
    expect(
      validateTimeOff(
        { ...valid, startDate: null, endDate: null, member: null },
        { today },
      ),
    ).toEqual({
      member: { key: "team:timeOff.validation.memberRequired" },
      startDate: { key: "team:timeOff.validation.dateRequired" },
      endDate: { key: "team:timeOff.validation.dateRequired" },
    });
  });

  it("rejects an end before the start", () => {
    expect(
      validateTimeOff({ ...valid, endDate: "2026-11-13" }, { today }),
    ).toEqual({ endDate: { key: "team:timeOff.validation.endBeforeStart" } });
  });

  it("rejects more than 366 days", () => {
    expect(
      validateTimeOff(
        { ...valid, startDate: "2026-01-01", endDate: "2027-01-02" },
        { today },
      ),
    ).toEqual({ endDate: { key: "team:timeOff.validation.tooLong" } });
  });

  it("keeps days between Jan 1 of last year and Dec 31 of next year", () => {
    const window = timeOffWindow(today);
    expect(window).toEqual({ earliest: "2025-01-01", latest: "2027-12-31" });
    expect(
      validateTimeOff(
        { ...valid, startDate: "2024-12-30", endDate: "2025-01-03" },
        { today },
      ),
    ).toEqual({
      startDate: { key: "team:timeOff.validation.outOfRange", window },
    });
    expect(
      validateTimeOff(
        { ...valid, startDate: "2027-12-27", endDate: "2028-01-03" },
        { today },
      ),
    ).toEqual({
      endDate: { key: "team:timeOff.validation.outOfRange", window },
    });
  });

  it("rejects a weekend-only range", () => {
    expect(
      validateTimeOff(
        { ...valid, startDate: "2026-11-14", endDate: "2026-11-15" },
        { today },
      ),
    ).toEqual({ endDate: { key: "team:timeOff.validation.noWeekdays" } });
  });

  it("rejects a range of only weekends and the member's holidays", () => {
    // Friday 2026-12-25 and the weekend after it.
    const holidays = new Set(["2026-12-25"]);
    expect(
      validateTimeOff(
        { ...valid, startDate: "2026-12-25", endDate: "2026-12-27" },
        { today, holidays },
      ),
    ).toEqual({ endDate: { key: "team:timeOff.validation.noWeekdays" } });
    expect(
      validateTimeOff(
        { ...valid, startDate: "2026-12-25", endDate: "2026-12-28" },
        { today, holidays },
      ),
    ).toEqual({});
  });

  it("skips the date limits when an edit keeps the stored dates", () => {
    const old = { startDate: "2024-03-02", endDate: "2024-03-03" };
    expect(
      validateTimeOff({ ...valid, ...old }, { today, original: old }),
    ).toEqual({});
  });

  it("never treats going over the allowance as an error", () => {
    expect(
      validateTimeOff(
        { ...valid, startDate: "2026-01-05", endDate: "2026-12-31" },
        { today },
      ),
    ).toEqual({});
  });
});
