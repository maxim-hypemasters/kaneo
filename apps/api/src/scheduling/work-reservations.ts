import { effectiveAssigneeId } from "../task/assignee-away/availability-checks";
import type { Reservation } from "./fit-task-dates";

export type ReservableWork = {
  userId: string | null;
  scheduledAssigneeId: string | null;
  scheduleSegments: readonly { start: string; end: string }[] | null;
  startDate: Date | null;
  dueDate: Date | null;
};

// The time `assigneeId` holds for other work: planned segments as planned,
// else the start-to-due span of work given both dates. Work with only a due
// date reserves nothing, since nothing says when it is done. Planned work
// belongs to its planned assignee, anything else to its assignee.
export function workReservations(
  work: readonly ReservableWork[],
  assigneeId: string,
): Reservation[] {
  return work.flatMap((item) => {
    if (effectiveAssigneeId(item) !== assigneeId) return [];
    if (item.scheduleSegments?.length)
      return item.scheduleSegments.map((segment) => ({
        start: new Date(segment.start),
        end: new Date(segment.end),
      }));
    return item.startDate && item.dueDate && item.startDate < item.dueDate
      ? [{ start: item.startDate, end: item.dueDate }]
      : [];
  });
}
