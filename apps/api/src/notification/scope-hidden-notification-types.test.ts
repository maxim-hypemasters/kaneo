import { describe, expect, it } from "vite-plus/test";
import { scopeHiddenNotificationTypes } from "./scope-hidden-notification-types";

const allTimeOff = [
  "time_off_requested",
  "time_off_approved",
  "time_off_declined",
  "time_off_member_away",
  "time_off_holiday_calendar_requested",
  "time_off_holiday_calendar_approved",
  "time_off_holiday_calendar_declined",
];

describe("scopeHiddenNotificationTypes", () => {
  it("hides nothing from sessions and unscoped keys", () => {
    expect(scopeHiddenNotificationTypes(null)).toEqual([]);
    expect(scopeHiddenNotificationTypes(undefined)).toEqual([]);
  });

  it("hides every time off notice from a key without time_off:read", () => {
    expect(scopeHiddenNotificationTypes({ task: ["read"] })).toEqual(
      allTimeOff,
    );
    expect(
      scopeHiddenNotificationTypes({ time_off: ["create", "approve"] }),
    ).toEqual(allTimeOff);
  });

  it("hides open requests from a key that can read but not approve", () => {
    expect(
      scopeHiddenNotificationTypes({ time_off: ["read", "create"] }),
    ).toEqual(["time_off_requested", "time_off_holiday_calendar_requested"]);
  });

  it("hides nothing from a key that can read and approve", () => {
    expect(
      scopeHiddenNotificationTypes({ time_off: ["read", "approve"] }),
    ).toEqual([]);
  });
});
