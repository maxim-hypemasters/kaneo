import { subscribeToEvent } from "../../events";
import type {
  HolidayCalendarRequestChangeEvent,
  TimeOffChangeEvent,
} from "../publish-time-off-change";
import { broadcastTimeOffChange } from "./broadcast-time-off-change";
import { notifyHolidayCalendarRequestChange } from "./notify-holiday-calendar-request-change";
import { notifyTimeOffChange } from "./notify-time-off-change";

// Separate subscriptions, so a failed notification never holds back the
// live update, or the other way round.
subscribeToEvent<TimeOffChangeEvent>(
  "time-off.request-changed",
  async (change) => {
    await broadcastTimeOffChange(
      change.workspaceId,
      {
        kind: "request",
        previousStatus: change.previousStatus,
        status: change.status,
      },
      change.userId,
    );
  },
);

subscribeToEvent<TimeOffChangeEvent>(
  "time-off.request-changed",
  notifyTimeOffChange,
);

subscribeToEvent<{ workspaceId: string }>(
  "time-off.settings-changed",
  async ({ workspaceId }) => {
    await broadcastTimeOffChange(workspaceId, { kind: "settings" }, null);
  },
);

// Calendar holidays are public who-and-when, like approved time off.
subscribeToEvent<{ workspaceId: string }>(
  "time-off.holiday-calendar-changed",
  async ({ workspaceId }) => {
    await broadcastTimeOffChange(
      workspaceId,
      { kind: "holiday-calendar" },
      null,
    );
  },
);

// Calendar requests stay with the member and approvers, like pending time
// off. Approving one also publishes holiday-calendar-changed.
subscribeToEvent<HolidayCalendarRequestChangeEvent>(
  "time-off.holiday-calendar-request-changed",
  async ({ workspaceId, userId }) => {
    await broadcastTimeOffChange(
      workspaceId,
      { kind: "holiday-calendar-request" },
      userId,
    );
  },
);

subscribeToEvent<HolidayCalendarRequestChangeEvent>(
  "time-off.holiday-calendar-request-changed",
  notifyHolidayCalendarRequestChange,
);
