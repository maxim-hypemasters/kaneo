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
      // A feature's tasks that followed it (movedTaskIds) now have exactly its
      // release, so the board is patched rather than reloaded page by page.
      updateBoardTaskCache(
        queryClient,
        task.projectId,
        task.id,
        { releaseId: updated.releaseId },
        context?.version,
      );
      for (const id of updated.movedTaskIds)
        updateBoardTaskCache(queryClient, task.projectId, id, {
          releaseId: updated.releaseId,
        });
      invalidateReleaseChange(
        queryClient,
        task.projectId,
        [task.id, ...updated.movedTaskIds],
        { board: false },
      );
    },
  });
}
