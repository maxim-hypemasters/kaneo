import { describe, expect, it } from "vite-plus/test";
import { timeOffNotificationSearch } from "./time-off-notification-search";

describe("timeOffNotificationSearch", () => {
  it("sends approvers to Approvals", () => {
    expect(
      timeOffNotificationSearch("time_off_requested", "2026-11-16"),
    ).toEqual({ view: "approvals" });
  });

  it("sends the requester to their own time off in that month", () => {
    expect(
      timeOffNotificationSearch("time_off_approved", "2026-12-28"),
    ).toEqual({ view: "mine", month: "2026-12" });
    expect(
      timeOffNotificationSearch("time_off_declined", "2027-01-04"),
    ).toEqual({ view: "mine", month: "2027-01" });
  });

  it("sends everyone else to the Team month", () => {
    expect(
      timeOffNotificationSearch("time_off_member_away", "2026-11-16"),
    ).toEqual({ view: "team", month: "2026-11" });
  });

  it("sends holiday calendar requests to Approvals and decisions to the member", () => {
    expect(
      timeOffNotificationSearch("time_off_holiday_calendar_requested", null),
    ).toEqual({ view: "approvals" });
    for (const type of [
      "time_off_holiday_calendar_approved",
      "time_off_holiday_calendar_declined",
    ] as const)
      expect(timeOffNotificationSearch(type, undefined)).toEqual({
        view: "mine",
      });
  });

  it("leaves the month out when the date is missing", () => {
    expect(timeOffNotificationSearch("time_off_member_away", null)).toEqual({
      view: "team",
    });
  });
});
