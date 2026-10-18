import type { Release } from "@/types/release";
import { compareReleasesByStart } from "./sort-releases";

export const EMPTY_RELEASE_PROGRESS: Release["progress"] = {
  tasks: { total: 0, completed: 0 },
  features: { total: 0, completed: 0 },
  unfinished: 0,
};

// Puts a created or updated release into a cached list, keeping its progress
// (create and update responses carry none) and the list's start-date order.
export function upsertRelease(
  releases: readonly Release[],
  release: Omit<Release, "progress">,
): Release[] {
  const existing = releases.find((item) => item.id === release.id);
  const next: Release = {
    ...release,
    progress: existing?.progress ?? EMPTY_RELEASE_PROGRESS,
  };
  return [...releases.filter((item) => item.id !== release.id), next].sort(
    compareReleasesByStart,
  );
}
