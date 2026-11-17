import { localDate } from "../../scheduling/engine/zoned-time";
import type { DateEndpoint, DateField } from "./availability-checks";

export type CheckedDay = {
  taskId: string;
  assigneeId: string;
  field: DateField;
  day: string;
};

// The calendar day (YYYY-MM-DD) each date falls on in `timeZone`, the zone it
// was picked in.
export function checkedDays(check: {
  taskId: string;
  assigneeId: string;
  endpoints: readonly DateEndpoint[];
  timeZone: string;
}): CheckedDay[] {
  return check.endpoints.map(({ field, at }) => ({
    taskId: check.taskId,
    assigneeId: check.assigneeId,
    field,
    day: localDate(at.getTime(), check.timeZone),
  }));
}

// One window per calendar year the days fall in, from its first day to its
// last, so no read spans more than a year however far apart the dates are.
export function yearWindows(days: readonly string[]) {
  const byYear = new Map<string, { from: string; to: string }>();
  for (const day of days) {
    const window = byYear.get(day.slice(0, 4));
    if (!window) byYear.set(day.slice(0, 4), { from: day, to: day });
    else {
      if (day < window.from) window.from = day;
      if (day > window.to) window.to = day;
    }
  }
  return [...byYear.values()];
}
