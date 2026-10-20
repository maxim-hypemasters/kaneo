import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskRelease from "@/fetchers/task/update-task-release";
import {
  getBoardCacheVersion,
  markBoardCacheChanged,
} from "@/lib/board-cache-version";
import { invalidateReleaseChange } from "@/lib/invalidate-release-change";
import { updateBoardTaskCache } from "@/lib/update-board-task-cache";
import type Task from "@/types/task";

type Variables = {
  task: Pick<Task, "id" | "projectId">;
  // null takes the task out of its release.
  releaseId: string | null;
};

export function useUpdateTaskRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ task, releaseId }: Variables) =>
      updateTaskRelease(task.id, releaseId),
    onMutate: ({ task }) => {
      markBoardCacheChanged(queryClient, task.projectId, task.id);
      return {
        version: getBoardCacheVersion(queryClient, task.projectId, task.id),
      };
    },
    onSuccess: (updated, { task }, context) => {
      // A leaf release edit preserves other work's explicit releases.
      updateBoardTaskCache(
        queryClient,
        task.projectId,
        task.id,
        { releaseId: updated.releaseId },
        context?.version,
      );
      invalidateReleaseChange(queryClient, task.projectId, [task.id], {
        board: false,
      });
    },
  });
}
