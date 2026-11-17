import { describe, expect, it } from "vite-plus/test";
import {
  scheduleRefreshNeeded,
  type TimeOffSnapshot,
} from "./schedule-refresh-needed";

const today = "2026-11-14";
const range = (
  status: TimeOffSnapshot["status"],
  startDate = "2026-11-16",
  endDate = "2026-11-20",
): TimeOffSnapshot => ({ status, startDate, endDate });

describe("scheduleRefreshNeeded", () => {
  it("refreshes when future time off is approved or approved time off is cancelled", () => {
    expect(
      scheduleRefreshNeeded(range("pending"), range("approved"), today),
    ).toBe(true);
    expect(
      scheduleRefreshNeeded(range("approved"), range("cancelled"), today),
    ).toBe(true);
  });

  it("ignores changes that never involve approved time off", () => {
    expect(scheduleRefreshNeeded(null, range("pending"), today)).toBe(false);
    expect(
      scheduleRefreshNeeded(range("pending"), range("pending"), today),
    ).toBe(false);
    expect(
      scheduleRefreshNeeded(range("pending"), range("declined"), today),
    ).toBe(false);
    expect(
      scheduleRefreshNeeded(range("pending"), range("cancelled"), today),
    ).toBe(false);
  });

  it("ignores approved edits that keep the dates", () => {
    expect(
      scheduleRefreshNeeded(range("approved"), range("approved"), today),
    ).toBe(false);
  });

  it("refreshes when approved dates change", () => {
    expect(
      scheduleRefreshNeeded(
        range("approved"),
        range("approved", "2026-11-16", "2026-11-18"),
        today,
      ),
    ).toBe(true);
  });

  it("skips time off that ended before yesterday and keeps yesterday", () => {
    const past = range("approved", "2026-11-02", "2026-11-12");
    const endedYesterday = range("approved", "2026-11-09", "2026-11-13");
    expect(scheduleRefreshNeeded(range("pending"), past, today)).toBe(false);
    expect(
      scheduleRefreshNeeded(past, { ...past, status: "cancelled" }, today),
    ).toBe(false);
    expect(scheduleRefreshNeeded(range("pending"), endedYesterday, today)).toBe(
      true,
    );
  });

  it("refreshes when an approved edit moves past time off into the future", () => {
    expect(
      scheduleRefreshNeeded(
        range("approved", "2026-11-02", "2026-11-06"),
        range("approved", "2026-11-23", "2026-11-27"),
        today,
      ),
    ).toBe(true);
  });

  it("crosses month and year boundaries when finding yesterday", () => {
    expect(
      scheduleRefreshNeeded(
        range("pending"),
        range("approved", "2026-12-28", "2026-12-31"),
        "2027-01-01",
      ),
    ).toBe(true);
  });
});
