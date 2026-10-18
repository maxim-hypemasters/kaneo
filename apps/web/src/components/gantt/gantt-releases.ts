import type { BoardFilters } from "@/hooks/use-task-filters";

// The releases the chart draws, following the Release filter: all of them
// without one, the chosen ones for "is", the others for "is not". No release
// matches no release, so "is No release" draws none.
export function ganttReleases<T extends { id: string }>(
  releases: readonly T[],
  filters: Pick<BoardFilters, "release" | "negated">,
): readonly T[] {
  const chosen = filters.release;
  if (!chosen?.length) return releases;
  const negated = filters.negated?.includes("release") ?? false;
  return releases.filter((release) => chosen.includes(release.id) !== negated);
}
