import { parseReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDates } from "@/types/release";

// Current and upcoming releases (submission today or later), from start to
// submission: the chart opens on them as well as on the tasks.
export function openingReleaseSpans(
  releases: readonly ReleaseDates[],
  today: string,
) {
  return releases
    .filter((release) => release.submissionDate >= today)
    .map((release) => ({
      scheduleStart: parseReleaseDate(release.startDate),
      scheduleEnd: parseReleaseDate(release.submissionDate),
    }));
}
