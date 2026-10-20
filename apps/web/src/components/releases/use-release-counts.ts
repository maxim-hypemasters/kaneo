import { useMemo } from "react";
import type { Release } from "@/types/release";
import { countReleaseItems } from "./release-counts";

// Milestones are fetched separately from the task board. The API aggregate
// is the complete source for release execution counts.
export function useReleaseCounts(
  _projectId: string,
  releases: readonly Release[],
) {
  return useMemo(() => countReleaseItems(releases, undefined), [releases]);
}
