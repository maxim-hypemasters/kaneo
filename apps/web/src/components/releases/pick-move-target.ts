import { compareReleasesByStart } from "@/lib/releases/sort-releases";
import type { ReleaseDates } from "@/types/release";

type MoveRelease = ReleaseDates & { id: string; name: string };

// Where Move unfinished points first: the release that comes next by start
// date (the API's order), or no release when this one is the last.
export function pickMoveTarget(
  releases: readonly MoveRelease[],
  source: MoveRelease,
): string | null {
  const next = releases
    .filter(
      (release) =>
        release.id !== source.id && compareReleasesByStart(release, source) > 0,
    )
    .sort(compareReleasesByStart)[0];
  return next?.id ?? null;
}
