import type { ReleaseDates } from "@/types/release";
import { releasePhase } from "./release-phase";

type SortableRelease = ReleaseDates & { id: string; name: string };

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

// The API's order: start date, then name, then id.
export function compareReleasesByStart(
  left: SortableRelease,
  right: SortableRelease,
) {
  return (
    compareText(left.startDate, right.startDate) ||
    compareText(left.name, right.name) ||
    compareText(left.id, right.id)
  );
}

function bySubmission(left: SortableRelease, right: SortableRelease) {
  return (
    compareText(left.submissionDate, right.submissionDate) ||
    compareReleasesByStart(left, right)
  );
}

// Active (in progress or in code freeze) soonest submission first, upcoming by
// start, past most recent submission first.
export function sortReleases<T extends SortableRelease>(
  releases: readonly T[],
  today: string,
) {
  const active: T[] = [];
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const release of releases) {
    const phase = releasePhase(release, today);
    if (phase === "upcoming") upcoming.push(release);
    else if (phase === "pastSubmission") past.push(release);
    else active.push(release);
  }
  active.sort(bySubmission);
  upcoming.sort(compareReleasesByStart);
  past.sort((left, right) => bySubmission(right, left));
  return { active, upcoming, past };
}
