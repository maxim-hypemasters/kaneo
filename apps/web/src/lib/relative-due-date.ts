import { differenceInCalendarDays, isSameYear } from "date-fns";

export type RelativeDueDate =
  | { kind: "overdue"; days: number; weeks: number }
  | { kind: "overdue-time" }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "soon"; days: number }
  | { kind: "date"; sameYear: boolean };

export function getRelativeDueDate(
  dueDate: string | Date,
  now: Date = new Date(),
  applied = false,
): RelativeDueDate {
  const due = new Date(dueDate);
  const days = differenceInCalendarDays(due, now);

  if (applied && days === 0 && due.getTime() < now.getTime())
    return { kind: "overdue-time" };
  if (days < 0) {
    return { kind: "overdue", days: -days, weeks: Math.floor(-days / 7) };
  }
  if (days === 0) return { kind: "today" };
  if (days === 1) return { kind: "tomorrow" };
  if (days <= 6) return { kind: "soon", days };
  return { kind: "date", sameYear: isSameYear(due, now) };
}
