// A task's release as its properties show it: the release, null for none,
// "unknown" when the project's releases don't list it (it was deleted, or the
// list failed to load), undefined while that can't be told yet.
export type TaskRelease<R> = R | null | "unknown" | undefined;

export function findTaskRelease<R extends { id: string }>({
  releaseId,
  releases,
  failed,
}: {
  releaseId: string | null | undefined;
  releases: readonly R[] | undefined;
  failed: boolean;
}): TaskRelease<R> {
  if (!releaseId) return releaseId === null ? null : undefined;
  const release = releases?.find(({ id }) => id === releaseId);
  if (release) return release;
  return releases || failed ? "unknown" : undefined;
}
