import { and, eq, inArray, or } from "drizzle-orm";
import db from "../database";
import { projectTable, taskTable } from "../database/schema";
import { publishEvent } from "../events";
import type { TimeOffRow } from "./present-time-off";
import {
  scheduleRefreshNeeded,
  type TimeOffSnapshot,
} from "./schedule-refresh-needed";
import type { TimeOffStatus } from "./time-off-kinds";

// Ids and dates only: type, note and balances never leave the API this way.
export type TimeOffChangeEvent = {
  workspaceId: string;
  timeOffId: string;
  userId: string;
  // Null when the system acted, such as cleanup after a member is removed.
  actorId: string | null;
  previousStatus: TimeOffStatus | null;
  status: TimeOffStatus;
  startDate: string;
  endDate: string;
};

// Projects with a task or bug the member is assigned or planned for: the only
// plans their time off can move.
async function assignedProjectIds(workspaceId: string, userId: string) {
  const rows = await db
    .selectDistinct({ id: projectTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        inArray(taskTable.type, ["task", "bug"]),
        or(
          eq(taskTable.userId, userId),
          eq(taskTable.scheduledAssigneeId, userId),
        ),
      ),
    );
  return rows.map((row) => row.id);
}

// Call after the transaction commits, and only when the row changed. `before`
// is the locked row the change started from, or null for a new request.
export async function publishTimeOffChange(change: {
  before: TimeOffSnapshot | null;
  after: TimeOffRow;
  actorId: string | null;
  today: string;
}) {
  const { before, after, actorId, today } = change;
  const event: TimeOffChangeEvent = {
    workspaceId: after.workspaceId,
    timeOffId: after.id,
    userId: after.userId,
    actorId,
    previousStatus: before?.status ?? null,
    status: after.status,
    startDate: after.startDate,
    endDate: after.endDate,
  };
  await publishEvent("time-off.request-changed", event);
  if (!scheduleRefreshNeeded(before, after, today)) return;
  const projectIds = await assignedProjectIds(after.workspaceId, after.userId);
  if (projectIds.length > 0)
    await publishEvent("project-schedule.changed", {
      workspaceId: after.workspaceId,
      projectIds,
    });
}

// Workspace settings such as allowances and the holiday calendar deadline.
export async function publishTimeOffSettingsChange(workspaceId: string) {
  await publishEvent("time-off.settings-changed", { workspaceId });
}

// Ids and statuses only: never the country or region asked for.
export type HolidayCalendarRequestChangeEvent = {
  workspaceId: string;
  requestId: string;
  userId: string;
  // Null when the system acted, such as cleanup after a member is removed.
  actorId: string | null;
  previousStatus: TimeOffStatus | null;
  status: TimeOffStatus;
};

// Call after the transaction commits. A request alone never moves holidays
// or plans; an approval that applies a calendar also publishes
// publishHolidayCalendarChange.
export async function publishHolidayCalendarRequestChange(
  change: HolidayCalendarRequestChangeEvent,
) {
  await publishEvent("time-off.holiday-calendar-request-changed", change);
}

// Ids only: never the country, region or holiday names. A member's calendar
// moves their planned work like approved time off, so their plans refresh.
export async function publishHolidayCalendarChange(
  workspaceId: string,
  userId: string,
) {
  await publishEvent("time-off.holiday-calendar-changed", {
    workspaceId,
    userId,
  });
  const projectIds = await assignedProjectIds(workspaceId, userId);
  if (projectIds.length > 0)
    await publishEvent("project-schedule.changed", { workspaceId, projectIds });
}
