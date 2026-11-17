import { toReleaseDate } from "@/lib/releases/release-date";
import type { AwayDaysByUser } from "@/lib/time-off/away-days";
import type { GanttTaskEdit, ScheduledTask } from "../gantt-types";
import { parseTaskDate } from "../timeline";

export type AwayHit = { userId: string; date: string /* YYYY-MM-DD */ };

function dayOf(value: string | null | undefined) {
  const date = parseTaskDate(value ?? null);
  return date ? toReleaseDate(date) : null;
}

// The day an edit would make a task start or be due on while its assignee
// is away, or null. It mirrors the server's rule (availabilityChecks), and
// is never stricter: only the dates the edit changes are checked, or every
// date the task has when the bar goes to someone else, so time off approved
// over existing work never blocks an unrelated edit. Planned work that is
// moved, not resized, is laid out around those days by the server instead,
// and milestones and unassigned work have no such rule. Days are the
// viewer's local days, as the columns show them.
export function blockedEditDay(
  task: ScheduledTask,
  edit: GanttTaskEdit,
  byUser: AwayDaysByUser,
): AwayHit | null {
  if (task.entityKind === "milestone") return null;
  if (task.scheduleApplied && !edit.exact) return null;
  // Planned work set by hand in its lane goes back to the task's own
  // assignee, who differs from the planned one (the lane) after a
  // reassignment since Apply; that counts as handing it over.
  const userId =
    task.scheduleApplied &&
    edit.userId === (task.userId || null) &&
    task.taskUserId !== undefined
      ? task.taskUserId
      : edit.userId;
  const awayDays = userId ? byUser.get(userId) : undefined;
  if (!userId || !awayDays) return null;
  const handedOver = userId !== (task.userId || null);
  // A move keeps the date fields the task has; a resize sets both.
  const endpoints = [
    {
      before: dayOf(task.startDate),
      after: edit.exact || task.startDate ? toReleaseDate(edit.start) : null,
    },
    {
      before: dayOf(task.dueDate),
      after: edit.exact || task.dueDate ? toReleaseDate(edit.end) : null,
    },
  ];
  for (const { before, after } of endpoints) {
    if (after && (handedOver || after !== before) && awayDays.has(after))
      return { userId, date: after };
  }
  return null;
}
