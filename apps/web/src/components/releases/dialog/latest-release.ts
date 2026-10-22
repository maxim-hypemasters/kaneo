import type { ReleaseDates } from "@/types/release";

// Keep the first release in the query's stable order when submissions tie.
export function latestRelease<T extends Pick<ReleaseDates, "submissionDate">>(
  releases: readonly T[],
): T | null {
  return releases.reduce<T | null>(
    (found, release) =>
      !found || release.submissionDate > found.submissionDate ? release : found,
    null,
  );
}
