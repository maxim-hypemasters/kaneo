import { addDays, differenceInCalendarDays } from "date-fns";
import { parseReleaseDate, toReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDates } from "@/types/release";
import { latestRelease } from "./latest-release";

// Dates for a new release: it starts the day after the latest submission (not
// before today) and keeps that release's lengths, so a regular cadence fills
// itself in. None without an earlier release.
export function suggestReleaseDates(
  releases: readonly ReleaseDates[],
  today: string,
): ReleaseDates | null {
  const latest = latestRelease(releases);
  if (!latest) return null;
  const latestStart = parseReleaseDate(latest.startDate);
  const freezeOffset = differenceInCalendarDays(
    parseReleaseDate(latest.codeFreezeDate),
    latestStart,
  );
  const submissionOffset = differenceInCalendarDays(
    parseReleaseDate(latest.submissionDate),
    latestStart,
  );
  const dayAfter = toReleaseDate(
    addDays(parseReleaseDate(latest.submissionDate), 1),
  );
  const start = parseReleaseDate(dayAfter > today ? dayAfter : today);
  return {
    startDate: toReleaseDate(start),
    codeFreezeDate: toReleaseDate(addDays(start, freezeOffset)),
    submissionDate: toReleaseDate(addDays(start, submissionOffset)),
  };
}
