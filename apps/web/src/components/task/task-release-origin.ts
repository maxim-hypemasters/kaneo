export type TaskReleaseOrigin = {
  projectId: string;
  releaseId: string;
};

export type TaskReleaseSearch = { originReleaseId?: string };

export function validateTaskReleaseSearch(
  search: Record<string, unknown>,
): TaskReleaseSearch {
  const id = search.originReleaseId;
  return {
    originReleaseId:
      typeof id === "string" && /^[A-Za-z0-9_-]{1,255}$/.test(id)
        ? id
        : undefined,
  };
}

export function getTaskReleaseOrigin(
  projectId: string,
  taskProjectId: string | undefined,
  releaseId: string | undefined,
): TaskReleaseOrigin | null {
  return releaseId && projectId === taskProjectId
    ? { projectId, releaseId }
    : null;
}

export function taskReleaseSearch(
  origin: TaskReleaseOrigin | null,
  projectId: string,
): TaskReleaseSearch {
  return origin?.projectId === projectId
    ? { originReleaseId: origin.releaseId }
    : {};
}

export function resolveOriginRelease(
  originReleaseId: string | undefined,
  projectId: string,
  releases: ReadonlyArray<{ id: string; projectId: string }>,
): string | null {
  return (
    releases.find(
      (release) =>
        release.id === originReleaseId && release.projectId === projectId,
    )?.id ?? null
  );
}
