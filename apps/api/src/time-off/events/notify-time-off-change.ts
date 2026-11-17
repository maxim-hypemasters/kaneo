import db from "../../database";
import createNotification from "../../notification/controllers/create-notification";
import { workspaceMembersWithPermission } from "../../utils/workspace-members-with-permission";
import { NO_HOLIDAYS } from "../count-workdays";
import { readHolidayDays } from "../holidays/read-holiday-days";
import type { TimeOffChangeEvent } from "../publish-time-off-change";
import { rangeYears } from "../range-years";
import {
  planTimeOffNotifications,
  timeOffNotificationTriggers,
} from "../time-off-notifications";
import { readUserNames } from "./read-user-names";

// Creates the inbox notifications for one request change. createNotification
// re-checks workspace membership and the recipient's preferences.
export async function notifyTimeOffChange(change: TimeOffChangeEvent) {
  const today = new Date().toISOString().slice(0, 10);
  const triggers = timeOffNotificationTriggers(change, today);
  if (!triggers.requested && !triggers.decided) return;
  const [approverIds, readerIds, names, holidays] = await Promise.all([
    triggers.requested
      ? workspaceMembersWithPermission(change.workspaceId, {
          time_off: ["approve"],
        })
      : [],
    triggers.memberAway
      ? workspaceMembersWithPermission(change.workspaceId, {
          time_off: ["read"],
        })
      : [],
    readUserNames([change.userId, change.actorId]),
    readHolidayDays(
      db,
      change.workspaceId,
      [change.userId],
      rangeYears(change),
    ),
  ]);
  const planned = planTimeOffNotifications({
    change,
    today,
    approverIds,
    readerIds,
    names,
    holidays: holidays.get(change.userId) ?? NO_HOLIDAYS,
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
