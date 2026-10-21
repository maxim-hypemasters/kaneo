import {
  validateTaskReleaseSearch,
  type TaskReleaseOrigin,
} from "@/components/task/task-release-origin";

export function featureCreationOrigin({
  pathname,
  search,
  projectId,
  originReleaseId,
  context,
}: {
  pathname: string;
  search?: Record<string, unknown>;
  projectId?: string;
  originReleaseId?: string;
  context: TaskReleaseOrigin | null;
}): TaskReleaseOrigin | null {
  const routeProjectId = pathname.match(/\/project\/([^/]+)/)?.[1];
  const actualProjectId = projectId || routeProjectId;
  const routeReleaseId = pathname.match(/\/releases\/([^/]+)/)?.[1];
  const id = validateTaskReleaseSearch({
    originReleaseId:
      originReleaseId ??
      routeReleaseId ??
      (context && context.projectId === actualProjectId
        ? context.releaseId
        : undefined) ??
      search?.originReleaseId,
  }).originReleaseId;
  return actualProjectId && id
    ? { projectId: actualProjectId, releaseId: id }
    : null;
}
