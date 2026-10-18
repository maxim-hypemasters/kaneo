import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import type { Release } from "@/types/release";
import type Task from "@/types/task";
import { findTaskRelease, type TaskRelease } from "./task-release-lookup";

// The task's release (null for none, "unknown" when its project doesn't list
// it, undefined while loading). The list is read only when there is a release
// to name.
export function useTaskRelease(
  task: Pick<Task, "projectId" | "releaseId"> | undefined,
): TaskRelease<Release> {
  const { data: releases, isError } = useGetReleases(task?.projectId, {
    enabled: Boolean(task?.releaseId),
  });
  if (!task) return undefined;
  return findTaskRelease({
    releaseId: task.releaseId,
    releases,
    failed: isError,
  });
}
