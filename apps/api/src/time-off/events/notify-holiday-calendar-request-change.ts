import createNotification from "../../notification/controllers/create-notification";
import { workspaceMembersWithPermission } from "../../utils/workspace-members-with-permission";
import {
  holidayCalendarRequestNotificationTriggers,
  planHolidayCalendarRequestNotifications,
} from "../holidays/requests/holiday-calendar-request-notifications";
import type { HolidayCalendarRequestChangeEvent } from "../publish-time-off-change";
import { readUserNames } from "./read-user-names";

// Creates the inbox notifications for one calendar request change.
// createNotification re-checks workspace membership and the recipient's
// preferences.
export async function notifyHolidayCalendarRequestChange(
  change: HolidayCalendarRequestChangeEvent,
) {
  const triggers = holidayCalendarRequestNotificationTriggers(change);
  if (!triggers.requested && !triggers.decided) return;
  const [approverIds, names] = await Promise.all([
    triggers.requested
      ? workspaceMembersWithPermission(change.workspaceId, {
          time_off: ["approve"],
        })
      : [],
    readUserNames([change.userId, change.actorId]),
  ]);
  const planned = planHolidayCalendarRequestNotifications({
    change,
    approverIds,
    names,
  });
  for (const row of planned)
    await createNotification({
      userId: row.userId,
      type: row.type,
      eventData: row.eventData,
      resourceId: change.workspaceId,
      resourceType: "workspace",
    });
}
