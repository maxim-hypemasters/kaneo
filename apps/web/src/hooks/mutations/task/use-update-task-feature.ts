import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskFeature from "@/fetchers/task/update-task-feature";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import type Task from "@/types/task";

type Variables = {
  task: Pick<Task, "id" | "projectId" | "featureId">;
  // null takes the task out of its feature.
  featureId: string | null;
};

export function useUpdateTaskFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ task, featureId }: Variables) =>
      updateTaskFeature(task.id, featureId),
    onSuccess: (_data, { task, featureId }) => {
      invalidateFeatureChange(queryClient, task.projectId, [
        task.id,
        task.featureId,
        featureId,
      ]);
    },
  });
}
