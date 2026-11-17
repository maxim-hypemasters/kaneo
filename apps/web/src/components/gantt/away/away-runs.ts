import { addDays, differenceInCalendarDays } from "date-fns";
import { parseReleaseDate, toReleaseDate } from "@/lib/releases/release-date";
import type { AwayDaysByUser, AwayKind } from "@/lib/time-off/away-days";

// Consecutive days away that show the same thing, as 0-based day indexes
// from the timeline's first day; `to` is exclusive.
export type AwayRun = {
  from: number;
  to: number;
  kind: AwayKind;
  name?: string;
};

export const NO_AWAY_RUNS: readonly AwayRun[] = [];

// Each member's runs within the rendered days. The work grows with the days
// away, not with the days rendered.
export function awayRunsByUser(
  byUser: AwayDaysByUser,
  rangeStart: Date,
  dayCount: number,
): ReadonlyMap<string, readonly AwayRun[]> {
  const runsByUser = new Map<string, AwayRun[]>();
  for (const [userId, days] of byUser) {
    const indexed = [...days]
      .map(([date, day]) => ({
        index: differenceInCalendarDays(parseReleaseDate(date), rangeStart),
        ...day,
      }))
      .filter(({ index }) => index >= 0 && index < dayCount)
      .sort((left, right) => left.index - right.index);
    const runs: AwayRun[] = [];
    for (const { index, kind, name } of indexed) {
      const last = runs.at(-1);
      if (last && last.to === index && last.kind === kind && last.name === name)
        last.to = index + 1;
      else
        runs.push({
          from: index,
          to: index + 1,
          kind,
          ...(name ? { name } : {}),
        });
    }
    if (runs.length) runsByUser.set(userId, runs);
  }
  return runsByUser;
}

// The runs that overlap [from, to), clipped to it.
export function runsWithin(
  runs: readonly AwayRun[],
  from: number,
  to: number,
): AwayRun[] {
  return runs.flatMap((run) =>
    run.to > from && run.from < to
      ? [{ ...run, from: Math.max(run.from, from), to: Math.min(run.to, to) }]
      : [],
  );
}

// A run's first and last day (YYYY-MM-DD).
export function runDates(run: AwayRun, rangeStart: Date) {
  return {
    startDate: toReleaseDate(addDays(rangeStart, run.from)),
    endDate: toReleaseDate(addDays(rangeStart, run.to - 1)),
  };
}
