import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  not,
  notInArray,
  or,
} from "drizzle-orm";
import { projectTable, taskTable } from "../database/schema";
import type { Reader } from "../time-off/access";
import { taskIsCompleted } from "../task/task-is-completed";
import { TRIAGE_STATUS } from "../triage/triage-status";
import type { Reservation } from "./fit-task-dates";
import { workReservations } from "./work-reservations";

// The time the assignee's other open, dated work holds anywhere in the
// workspace: Tasks and Bugs in live projects that are not archived, waiting
// in Triage or in a final column, and are due after `now`. See
// workReservations for what each one reserves.
export async function readAssigneeReservations(
  reader: Reader,
  {
    workspaceId,
    assigneeId,
    excludeTaskId,
    now,
  }: {
    workspaceId: string;
    assigneeId: string;
    excludeTaskId?: string;
    now: Date;
  },
): Promise<Reservation[]> {
  const work = await reader
    .select({
      userId: taskTable.userId,
      scheduledAssigneeId: taskTable.scheduledAssigneeId,
      scheduleSegments: taskTable.scheduleSegments,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
        or(
          eq(taskTable.userId, assigneeId),
          eq(taskTable.scheduledAssigneeId, assigneeId),
        ),
        inArray(taskTable.type, ["task", "bug"]),
        excludeTaskId ? ne(taskTable.id, excludeTaskId) : undefined,
        isNull(taskTable.archivedAt),
        notInArray(taskTable.status, ["archived", TRIAGE_STATUS]),
        not(taskIsCompleted),
        gt(taskTable.dueDate, now),
      ),
    );
  return workReservations(work, assigneeId);
}
