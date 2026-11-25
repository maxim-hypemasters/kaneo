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

const documentComments = ["document_mention", "document_comment_reply"];
const readsDocuments = { document: ["read"], feature: ["read"] };

describe("scopeHiddenNotificationTypes", () => {
  it("hides nothing from sessions and unscoped keys", () => {
    expect(scopeHiddenNotificationTypes(null)).toEqual([]);
    expect(scopeHiddenNotificationTypes(undefined)).toEqual([]);
  });

  it("hides every time off notice from a key without time_off:read", () => {
    expect(
      scopeHiddenNotificationTypes({ task: ["read"], ...readsDocuments }),
    ).toEqual(allTimeOff);
    expect(
      scopeHiddenNotificationTypes({
        time_off: ["create", "approve"],
        ...readsDocuments,
      }),
    ).toEqual(allTimeOff);
  });

  it("hides open requests from a key that can read but not approve", () => {
    expect(
      scopeHiddenNotificationTypes({
        time_off: ["read", "create"],
        ...readsDocuments,
      }),
    ).toEqual(["time_off_requested", "time_off_holiday_calendar_requested"]);
  });

  it("hides nothing from a key that can read and approve", () => {
    expect(
      scopeHiddenNotificationTypes({
        time_off: ["read", "approve"],
        ...readsDocuments,
      }),
    ).toEqual([]);
  });

  it("hides document comment notices from a key that cannot read both kinds of document", () => {
    const timeOff = { time_off: ["read", "approve"] };
    expect(scopeHiddenNotificationTypes(timeOff)).toEqual(documentComments);
    expect(
      scopeHiddenNotificationTypes({ ...timeOff, document: ["read"] }),
    ).toEqual(documentComments);
    expect(
      scopeHiddenNotificationTypes({ ...timeOff, feature: ["read"] }),
    ).toEqual(documentComments);
    expect(scopeHiddenNotificationTypes({ task: ["read"] })).toEqual([
      ...allTimeOff,
      ...documentComments,
    ]);
  });
});
