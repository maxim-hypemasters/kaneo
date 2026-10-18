import type { Release, ReleaseSummary } from "@/types/release";

// A select for useGetReleases: React Query keeps the selected list's identity
// when a refetch changes only progress, so its readers don't re-render.
export function releaseSummaries(
  releases: readonly Release[],
): ReleaseSummary[] {
  return releases.map(({ progress: _progress, ...release }) => release);
}
