import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskType from "@/fetchers/task/update-task-type";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import type Task from "@/types/task";
import type { TaskType } from "@/types/task";
import { invalidateMyWork } from "@/lib/invalidate-my-work";

type Variables = {
  task: Pick<Task, "id" | "projectId" | "featureId">;
  type: TaskType;
};

export function useUpdateTaskType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ task, type }: Variables) => updateTaskType(task.id, type),
    // A task becoming a feature leaves its own feature.
    onSuccess: (_data, { task }) => {
      invalidateMyWork(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      invalidateFeatureChange(queryClient, task.projectId, [
        task.id,
        task.featureId,
      ]);
    },
  });
}
