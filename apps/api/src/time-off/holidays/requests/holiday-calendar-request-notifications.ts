import type { HolidayCalendarRequestChangeEvent } from "../../publish-time-off-change";
import type { TimeOffNotificationType } from "../../time-off-notification-types";

export type HolidayCalendarRequestNotificationTriggers = {
  // A member asked for a calendar change.
  requested: boolean;
  // A pending request was approved or declined.
  decided: boolean;
};

// Resubmissions, withdrawals, cancellations by an approver's own change and
// the cleanup after a member is removed notify nobody.
export function holidayCalendarRequestNotificationTriggers(
  change: Pick<HolidayCalendarRequestChangeEvent, "previousStatus" | "status">,
): HolidayCalendarRequestNotificationTriggers {
  return {
    requested: change.previousStatus === null && change.status === "pending",
    decided:
      change.previousStatus === "pending" &&
      (change.status === "approved" || change.status === "declined"),
  };
}

export type PlannedHolidayCalendarRequestNotification = {
  userId: string;
  type: Extract<TimeOffNotificationType, `time_off_holiday_calendar_${string}`>;
  eventData: Record<string, string | null>;
};

// The notification rows for one request change. eventData carries ids and
// names only, never the country or region, because rows are forwarded to
// webhooks, MCP and the CLI. The person who acted is never notified.
export function planHolidayCalendarRequestNotifications(input: {
  change: HolidayCalendarRequestChangeEvent;
  // Members who may approve, used when a request is created.
  approverIds: readonly string[];
  names: Readonly<Record<string, string>>;
}): PlannedHolidayCalendarRequestNotification[] {
  const { change, approverIds, names } = input;
  const { workspaceId, requestId, userId, actorId } = change;
  const triggers = holidayCalendarRequestNotificationTriggers(change);
  const recipients = new Set<string>();
  const planned: PlannedHolidayCalendarRequestNotification[] = [];
  if (triggers.requested) {
    for (const approverId of approverIds) {
      if (approverId === actorId || recipients.has(approverId)) continue;
      recipients.add(approverId);
      planned.push({
        userId: approverId,
        type: "time_off_holiday_calendar_requested",
        eventData: {
          workspaceId,
          requestId,
          requesterId: userId,
          requesterName: names[userId] ?? null,
        },
      });
    }
  }
  if (triggers.decided && userId !== actorId) {
    planned.push({
      userId,
      type:
        change.status === "approved"
          ? "time_off_holiday_calendar_approved"
          : "time_off_holiday_calendar_declined",
      eventData: {
        workspaceId,
        requestId,
        deciderId: actorId,
        deciderName: actorId ? (names[actorId] ?? null) : null,
      },
    });
  }
  return planned;
}
