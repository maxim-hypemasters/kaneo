import { differenceInCalendarDays } from "date-fns";
import type { GanttTaskEdit, ScheduledTask } from "./gantt-types";
import { toIsoDay } from "./timeline";

// A saved-but-not-yet-refetched drag. The route shows it in place of the
// server data so a bar doesn't snap back (or jump lanes twice) while the
// request and the refetch are in flight.
export type PendingTaskEdit = GanttTaskEdit & {
  seq: number;
  assigneeName: string | null;
  assigneeImage: string | null;
  // Which date fields the task has once this edit is saved, so a later edit
  // made before the refetch sees them (a task with only a due date gains a
  // start date when dragged, but not when moved along by a dependency).
  hasStartDate: boolean;
  hasDueDate: boolean;
};

function sameDay(left: Date, right: Date) {
  return differenceInCalendarDays(left, right) === 0;
}

export function classifyEdit(task: ScheduledTask, edit: GanttTaskEdit) {
  return {
    dates:
      !sameDay(task.scheduleStart, edit.start) ||
      !sameDay(task.scheduleEnd, edit.end),
    assignee: (task.userId || null) !== edit.userId,
    milestone:
      (task.milestoneId ?? null) !==
      (edit.milestoneId === undefined
        ? (task.milestoneId ?? null)
        : edit.milestoneId),
  };
}

export function applyPendingEdit(
  task: ScheduledTask,
  pending: PendingTaskEdit,
): ScheduledTask {
  return {
    ...task,
    scheduleStart: pending.start,
    scheduleEnd: pending.end,
    startDate: pending.hasStartDate ? toIsoDay(pending.start) : null,
    dueDate: pending.hasDueDate ? toIsoDay(pending.end) : null,
    userId: pending.userId,
    assigneeId: pending.userId,
    assigneeName: pending.assigneeName,
    assigneeImage: pending.assigneeImage,
    milestoneId:
      pending.milestoneId === undefined
        ? task.milestoneId
        : pending.milestoneId,
  };
}

export function pendingEditLanded(
  task: ScheduledTask,
  pending: PendingTaskEdit,
) {
  return (
    sameDay(task.scheduleStart, pending.start) &&
    sameDay(task.scheduleEnd, pending.end) &&
    (task.userId || null) === pending.userId &&
    (task.milestoneId ?? null) === (pending.milestoneId ?? null)
  );
}
