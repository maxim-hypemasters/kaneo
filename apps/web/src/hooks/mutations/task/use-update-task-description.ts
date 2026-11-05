import {
  getBoardCacheVersion,
  markBoardCacheChanged,
} from "@/lib/board-cache-version";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskDescription, {
  type UpdateTaskDescriptionInput,
} from "@/fetchers/task/update-task-description";
import type Task from "@/types/task";
import { updateBoardTaskCache } from "@/lib/update-board-task-cache";

export function useUpdateTaskDescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: UpdateTaskDescriptionInput) =>
      updateTaskDescription(task.id, task),
    onMutate: (task: UpdateTaskDescriptionInput) => {
      markBoardCacheChanged(queryClient, task.projectId, task.id);
      return {
        version: getBoardCacheVersion(queryClient, task.projectId, task.id),
      };
    },
    onSuccess: (updated, variables, context) => {
      if (
        context?.version ===
        getBoardCacheVersion(queryClient, variables.projectId, variables.id)
      ) {
        queryClient.setQueryData<Task>(["task", variables.id], (previous) =>
          previous?.projectId === variables.projectId
            ? { ...previous, description: updated.description }
            : previous,
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ["project-features", variables.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["feature-library", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task", variables.id],
      });
      updateBoardTaskCache(
        queryClient,
        variables.projectId,
        variables.id,
        {
          description: updated.description,
        },
        context?.version,
      );
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.id],
      });
    },
  });
}
