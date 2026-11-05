import { differenceInCalendarDays } from "date-fns";

export const DUE_BUCKETS = [
  "overdue",
  "today",
  "thisWeek",
  "later",
  "noDueDate",
] as const;

export type DueBucket = (typeof DUE_BUCKETS)[number];

// Calendar days in the viewer's timezone, so "today" flips at their midnight.
export function getDueBucket(
  dueDate: string | null,
  now = new Date(),
  applied = false,
): DueBucket {
  if (!dueDate) return "noDueDate";

  if (applied && new Date(dueDate).getTime() < now.getTime()) return "overdue";
  const days = differenceInCalendarDays(new Date(dueDate), now);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "thisWeek";
  return "later";
}
