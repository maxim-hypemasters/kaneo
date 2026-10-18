import { differenceInCalendarDays } from "date-fns";
import { parseReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDates } from "@/types/release";

export type ReleaseTimelinePosition = {
  // Percent along the bar, start at 0 and submission at 100.
  codeFreeze: number;
  // Clamped to the bar.
  today: number;
  todayInRange: boolean;
};

// Where code freeze and today fall between start and submission. A one-day
// release fills the bar once it has started.
export function releaseTimelinePosition(
  release: ReleaseDates,
  today: string,
): ReleaseTimelinePosition {
  const start = parseReleaseDate(release.startDate);
  const span = differenceInCalendarDays(
    parseReleaseDate(release.submissionDate),
    start,
  );
  const at = (day: string) => {
    if (span === 0) return day < release.startDate ? 0 : 100;
    const percent =
      (differenceInCalendarDays(parseReleaseDate(day), start) / span) * 100;
    return Math.min(100, Math.max(0, percent));
  };
  return {
    codeFreeze: at(release.codeFreezeDate),
    today: at(today),
    todayInRange: today >= release.startDate && today <= release.submissionDate,
  };
}
