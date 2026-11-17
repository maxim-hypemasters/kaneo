import { describe, expect, it } from "vite-plus/test";
import { NO_HOLIDAYS } from "./count-workdays";
import type { TimeOffChangeEvent } from "./publish-time-off-change";
import type { TimeOffStatus } from "./time-off-kinds";
import {
  planTimeOffNotifications,
  timeOffNotificationTriggers,
} from "./time-off-notifications";

const today = "2026-11-14";

// Monday to Friday next week: five weekdays.
function change(
  previousStatus: TimeOffStatus | null,
  status: TimeOffStatus,
  overrides: Partial<TimeOffChangeEvent> = {},
): TimeOffChangeEvent {
  return {
    workspaceId: "ws",
    timeOffId: "to1",
    userId: "member",
    actorId: "member",
    previousStatus,
    status,
    startDate: "2026-11-16",
    endDate: "2026-11-20",
    ...overrides,
  };
}

const names = { member: "Mia", owner: "Olga", admin: "Adam" };
const approverIds = ["owner", "admin"];
const readerIds = ["owner", "admin", "member", "colleague", "viewer"];

function plan(event: TimeOffChangeEvent, holidays = NO_HOLIDAYS) {
  return planTimeOffNotifications({
    change: event,
    today,
    approverIds,
    readerIds,
    names,
    holidays,
  });
}

function recipients(event: TimeOffChangeEvent) {
  return plan(event).map((row) => `${row.type}:${row.userId}`);
}

describe("timeOffNotificationTriggers", () => {
  it("fires for new requests and decisions only", () => {
    expect(timeOffNotificationTriggers(change(null, "pending"), today)).toEqual(
      { requested: true, decided: false, memberAway: false },
    );
    expect(
      timeOffNotificationTriggers(change("pending", "approved"), today),
    ).toEqual({ requested: false, decided: true, memberAway: true });
    expect(
      timeOffNotificationTriggers(change("pending", "declined"), today),
    ).toEqual({ requested: false, decided: true, memberAway: false });
  });

  it("stays quiet for cancellations and edits", () => {
    const quiet = { requested: false, decided: false, memberAway: false };
    for (const [from, to] of [
      ["pending", "pending"],
      ["approved", "approved"],
      ["pending", "cancelled"],
      ["approved", "cancelled"],
    ] as const)
      expect(timeOffNotificationTriggers(change(from, to), today)).toEqual(
        quiet,
      );
  });

  it("announces approved time off only until it ends", () => {
    expect(
      timeOffNotificationTriggers(
        change("pending", "approved", { endDate: today }),
        today,
      ).memberAway,
    ).toBe(true);
    expect(
      timeOffNotificationTriggers(
        change("pending", "approved", {
          startDate: "2026-11-09",
          endDate: "2026-11-13",
        }),
        today,
      ).memberAway,
    ).toBe(false);
  });
});

describe("planTimeOffNotifications", () => {
  it("tells approvers about a new request with who, when and how many days", () => {
    expect(plan(change(null, "pending"))).toEqual([
      {
        userId: "owner",
        type: "time_off_requested",
        eventData: {
          workspaceId: "ws",
          timeOffId: "to1",
          requesterId: "member",
          requesterName: "Mia",
          startDate: "2026-11-16",
          endDate: "2026-11-20",
          days: 5,
        },
      },
      expect.objectContaining({ userId: "admin", type: "time_off_requested" }),
    ]);
  });

  it("counts working days, leaving out the member's calendar holidays", () => {
    const [row] = plan(change(null, "pending"), new Set(["2026-11-18"]));
    expect(row?.eventData.days).toBe(4);
    expect(JSON.stringify(row?.eventData)).not.toContain("2026-11-18");
  });

  it("skips the approver who requested or recorded the time off", () => {
    expect(
      recipients(
        change(null, "pending", { userId: "admin", actorId: "admin" }),
      ),
    ).toEqual(["time_off_requested:owner"]);
    expect(recipients(change(null, "pending", { actorId: "owner" }))).toEqual([
      "time_off_requested:admin",
    ]);
  });

  it("tells the requester about the decision and readers that they are away", () => {
    expect(plan(change("pending", "approved", { actorId: "owner" }))).toEqual([
      {
        userId: "member",
        type: "time_off_approved",
        eventData: {
          workspaceId: "ws",
          timeOffId: "to1",
          startDate: "2026-11-16",
          endDate: "2026-11-20",
          days: 5,
          deciderId: "owner",
          deciderName: "Olga",
        },
      },
      {
        userId: "admin",
        type: "time_off_member_away",
        eventData: {
          workspaceId: "ws",
          timeOffId: "to1",
          userId: "member",
          userName: "Mia",
          startDate: "2026-11-16",
          endDate: "2026-11-20",
        },
      },
      expect.objectContaining({ userId: "colleague" }),
      expect.objectContaining({ userId: "viewer" }),
    ]);
  });

  it("sends a decline to the requester only", () => {
    expect(
      recipients(change("pending", "declined", { actorId: "owner" })),
    ).toEqual(["time_off_declined:member"]);
  });

  it("skips the requester's own decision on a self-approval", () => {
    expect(
      recipients(
        change("pending", "approved", { userId: "owner", actorId: "owner" }),
      ),
    ).toEqual([
      "time_off_member_away:admin",
      "time_off_member_away:member",
      "time_off_member_away:colleague",
      "time_off_member_away:viewer",
    ]);
  });

  it("notifies nobody for cancellations, edits or removed-member cleanup", () => {
    expect(plan(change("pending", "cancelled"))).toEqual([]);
    expect(plan(change("approved", "cancelled", { actorId: "owner" }))).toEqual(
      [],
    );
    expect(plan(change("pending", "pending"))).toEqual([]);
    expect(plan(change("approved", "approved", { actorId: "owner" }))).toEqual(
      [],
    );
    expect(plan(change("pending", "cancelled", { actorId: null }))).toEqual([]);
  });

  it("lists each recipient once per type", () => {
    expect(
      planTimeOffNotifications({
        change: change(null, "pending"),
        today,
        approverIds: ["owner", "owner"],
        readerIds,
        names,
        holidays: NO_HOLIDAYS,
      }).map((row) => row.userId),
    ).toEqual(["owner"]);
  });

  it("never puts the time off type or note in event data", () => {
    for (const row of [
      ...plan(change(null, "pending")),
      ...plan(change("pending", "approved", { actorId: "owner" })),
      ...plan(change("pending", "declined", { actorId: "owner" })),
    ]) {
      expect(row.eventData).not.toHaveProperty("type");
      expect(row.eventData).not.toHaveProperty("note");
    }
  });

  it("leaves names null when they are unknown", () => {
    expect(
      planTimeOffNotifications({
        change: change(null, "pending"),
        today,
        approverIds: ["owner"],
        readerIds,
        names: {},
        holidays: NO_HOLIDAYS,
      })[0]?.eventData.requesterName,
    ).toBeNull();
  });
});
