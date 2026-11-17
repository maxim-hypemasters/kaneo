import { addDays } from "./engine/zoned-time";

export type DayRange = { startDate: string; endDate: string };

// Merges local days (YYYY-MM-DD, any order, repeats allowed) into inclusive
// runs of consecutive days, so a run costs one interval instead of one per day.
export function coalesceDays(days: Iterable<string>): DayRange[] {
  const runs: DayRange[] = [];
  for (const day of [...new Set(days)].sort()) {
    const last = runs.at(-1);
    if (last && addDays(last.endDate, 1) === day) last.endDate = day;
    else runs.push({ startDate: day, endDate: day });
  }
  return runs;
}
