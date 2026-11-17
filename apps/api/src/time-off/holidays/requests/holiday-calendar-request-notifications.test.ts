import { describe, expect, it } from "vite-plus/test";
import type { HolidayCalendarRequestChangeEvent } from "../../publish-time-off-change";
import type { TimeOffStatus } from "../../time-off-kinds";
import {
  holidayCalendarRequestNotificationTriggers,
  planHolidayCalendarRequestNotifications,
} from "./holiday-calendar-request-notifications";

function change(
  previousStatus: TimeOffStatus | null,
  status: TimeOffStatus,
  overrides: Partial<HolidayCalendarRequestChangeEvent> = {},
): HolidayCalendarRequestChangeEvent {
  return {
    workspaceId: "ws",
    requestId: "hcr1",
    userId: "member",
    actorId: "member",
    previousStatus,
    status,
    ...overrides,
  };
}

const names = { member: "Mia", owner: "Olga", admin: "Adam" };
const approverIds = ["owner", "admin"];

function plan(
  event: HolidayCalendarRequestChangeEvent,
  approvers: readonly string[] = approverIds,
) {
  return planHolidayCalendarRequestNotifications({
    change: event,
    approverIds: approvers,
    names,
  });
}

function recipients(event: HolidayCalendarRequestChangeEvent) {
  return plan(event).map((row) => `${row.type}:${row.userId}`);
}

describe("holidayCalendarRequestNotificationTriggers", () => {
  it("fires for new requests and decisions only", () => {
    expect(
      holidayCalendarRequestNotificationTriggers(change(null, "pending")),
    ).toEqual({ requested: true, decided: false });
    for (const status of ["approved", "declined"] as const)
      expect(
        holidayCalendarRequestNotificationTriggers(change("pending", status)),
      ).toEqual({ requested: false, decided: true });
  });

  it("stays quiet for resubmissions and cancellations", () => {
    for (const [from, to] of [
      ["pending", "pending"],
      ["pending", "cancelled"],
    ] as const)
      expect(
        holidayCalendarRequestNotificationTriggers(change(from, to)),
      ).toEqual({ requested: false, decided: false });
  });
});

describe("planHolidayCalendarRequestNotifications", () => {
  it("tells approvers who asked for a calendar change", () => {
    expect(plan(change(null, "pending"))).toEqual([
      {
        userId: "owner",
        type: "time_off_holiday_calendar_requested",
        eventData: {
          workspaceId: "ws",
          requestId: "hcr1",
          requesterId: "member",
          requesterName: "Mia",
        },
      },
      expect.objectContaining({
        userId: "admin",
        type: "time_off_holiday_calendar_requested",
      }),
    ]);
  });

  it("tells the member who decided", () => {
    expect(plan(change("pending", "approved", { actorId: "owner" }))).toEqual([
      {
        userId: "member",
        type: "time_off_holiday_calendar_approved",
        eventData: {
          workspaceId: "ws",
          requestId: "hcr1",
          deciderId: "owner",
          deciderName: "Olga",
        },
      },
    ]);
    expect(
      recipients(change("pending", "declined", { actorId: "admin" })),
    ).toEqual(["time_off_holiday_calendar_declined:member"]);
  });

  it("skips the person who acted", () => {
    expect(
      recipients(
        change(null, "pending", { userId: "admin", actorId: "admin" }),
      ),
    ).toEqual(["time_off_holiday_calendar_requested:owner"]);
    expect(
      recipients(
        change("pending", "approved", { userId: "owner", actorId: "owner" }),
      ),
    ).toEqual([]);
  });

  it("notifies nobody for resubmissions, withdrawals or removed-member cleanup", () => {
    expect(plan(change("pending", "pending"))).toEqual([]);
    expect(plan(change("pending", "cancelled"))).toEqual([]);
    expect(plan(change("pending", "cancelled", { actorId: "owner" }))).toEqual(
      [],
    );
    expect(plan(change("pending", "cancelled", { actorId: null }))).toEqual([]);
  });

  it("lists each approver once", () => {
    expect(
      plan(change(null, "pending"), ["owner", "owner"]).map(
        (row) => row.userId,
      ),
    ).toEqual(["owner"]);
  });

  it("never puts a country or region in event data", () => {
    for (const row of [
      ...plan(change(null, "pending")),
      ...plan(change("pending", "approved", { actorId: "owner" })),
      ...plan(change("pending", "declined", { actorId: "owner" })),
    ]) {
      expect(Object.keys(row.eventData).sort()).toEqual(
        row.type === "time_off_holiday_calendar_requested"
          ? ["requestId", "requesterId", "requesterName", "workspaceId"]
          : ["deciderId", "deciderName", "requestId", "workspaceId"],
      );
    }
  });

  it("leaves names null when they are unknown", () => {
    expect(
      planHolidayCalendarRequestNotifications({
        change: change(null, "pending"),
        approverIds: ["owner"],
        names: {},
      })[0]?.eventData.requesterName,
    ).toBeNull();
  });
});
