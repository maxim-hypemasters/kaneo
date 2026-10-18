import { differenceInCalendarDays } from "date-fns";
import { parseReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDates } from "@/types/release";
import type { releaseProgressGeometry } from "./release-progress-geometry";

type PredictionDates = Pick<ReleaseDates, "startDate" | "codeFreezeDate">;

// The ideal steady pace for today's task scope, independent of recorded work.
export function predictedProgress(
  release: PredictionDates,
  scope: number,
  date: string,
) {
  const start = parseReleaseDate(release.startDate);
  const days = differenceInCalendarDays(
    parseReleaseDate(release.codeFreezeDate),
    start,
  );
  if (days === 0) return date < release.codeFreezeDate ? 0 : scope;
  const elapsed = differenceInCalendarDays(parseReleaseDate(date), start);
  return scope * Math.max(0, Math.min(1, elapsed / days));
}

export function predictedProgressPath(
  release: PredictionDates,
  scope: number,
  geometry: ReturnType<typeof releaseProgressGeometry>,
) {
  return `M${geometry.x(release.startDate)},${geometry.y(0)}L${geometry.x(release.codeFreezeDate)},${geometry.y(scope)}`;
}
