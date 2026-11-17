import { countWorkdays } from "./count-workdays";
import type { TimeOffChangeEvent } from "./publish-time-off-change";
import type { TimeOffNotificationType } from "./time-off-notification-types";

export type TimeOffNotificationTriggers = {
  // A new request is waiting for a decision.
  requested: boolean;
  // A pending request was approved or declined.
  decided: boolean;
  // An approval for time off that has not ended yet (UTC).
  memberAway: boolean;
};

// Cancellations, pending edits, approver edits of approved time off and the
// cleanup after a member is removed notify nobody.
export function timeOffNotificationTriggers(
  change: Pick<TimeOffChangeEvent, "previousStatus" | "status" | "endDate">,
  today: string,
): TimeOffNotificationTriggers {
  const decided =
    change.previousStatus === "pending" &&
    (change.status === "approved" || change.status === "declined");
  return {
    requested: change.previousStatus === null && change.status === "pending",
    decided,
    memberAway:
      decided && change.status === "approved" && change.endDate >= today,
  };
}

export type PlannedTimeOffNotification = {
  userId: string;
  type: TimeOffNotificationType;
  eventData: Record<string, string | number | null>;
};

// The notification rows for one change. eventData carries ids, names, dates
// and the working-day count only: never the time off type, note or holiday
// names, because rows are forwarded to webhooks, MCP and the CLI.
export function planTimeOffNotifications(input: {
  change: TimeOffChangeEvent;
  today: string;
  // Members who may approve, used when a request is created.
  approverIds: readonly string[];
  // Members who may read the team timeline, used when time off is approved.
  readerIds: readonly string[];
  names: Readonly<Record<string, string>>;
  // The member's calendar holidays, left out of the day count.
  holidays: ReadonlySet<string>;
}): PlannedTimeOffNotification[] {
  const { change, today, approverIds, readerIds, names, holidays } = input;
  const triggers = timeOffNotificationTriggers(change, today);
  const { workspaceId, timeOffId, userId, actorId, startDate, endDate } =
    change;
  const days = countWorkdays(startDate, endDate, holidays);
  const planned = new Map<string, PlannedTimeOffNotification>();
  const add = (
    recipients: readonly string[],
    type: TimeOffNotificationType,
    eventData: PlannedTimeOffNotification["eventData"],
    skip: ReadonlyArray<string | null>,
  ) => {
    for (const recipient of recipients) {
      if (skip.includes(recipient)) continue;
      planned.set(`${type}:${recipient}`, {
        userId: recipient,
        type,
        eventData,
      });
    }
  };

  if (triggers.requested) {
    add(
      approverIds,
      "time_off_requested",
      {
        workspaceId,
        timeOffId,
        requesterId: userId,
        requesterName: names[userId] ?? null,
        startDate,
        endDate,
        days,
      },
      [actorId],
    );
  }
  if (triggers.decided) {
    add(
      [userId],
      change.status === "approved" ? "time_off_approved" : "time_off_declined",
      {
        workspaceId,
        timeOffId,
        startDate,
        endDate,
        days,
        deciderId: actorId,
        deciderName: actorId ? (names[actorId] ?? null) : null,
      },
      [actorId],
    );
  }
  if (triggers.memberAway) {
    add(
      readerIds,
      "time_off_member_away",
      {
        workspaceId,
        timeOffId,
        userId,
        userName: names[userId] ?? null,
        startDate,
        endDate,
      },
      [userId, actorId],
    );
  }
  return [...planned.values()];
}
