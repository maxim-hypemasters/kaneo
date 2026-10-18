import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import createTask, {
  type CreateTaskRequest,
} from "@/fetchers/task/create-task";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";
import { trackFirstTask } from "@/lib/analytics/activation";

function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      title,
      description,
      userId,
      projectId,
      status,
      startDate,
      dueDate,
      priority,
      customFields,
      draftAssetIds,
      type,
      featureId,
      releaseId,
    }: CreateTaskRequest) =>
      createTask(
        title,
        description,
        projectId,
        userId,
        status,
        startDate ? new Date(startDate) : undefined,
        dueDate ? new Date(dueDate) : undefined,
        priority,
        customFields,
        draftAssetIds,
        { type, featureId, releaseId },
      ),
    onSuccess: (data, variables) => {
      invalidateMyWork(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      trackFirstTask();
      void queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["custom-field-values", variables.projectId],
      });
      if (variables.type === "feature") {
        void queryClient.invalidateQueries({
          queryKey: ["project-features", variables.projectId],
        });
      }
      if (variables.featureId) {
        void queryClient.invalidateQueries({
          queryKey: ["task", variables.featureId],
        });
      }
      // Picked or taken from its feature, the release's progress changed.
      if (data.releaseId) {
        void queryClient.invalidateQueries({
          queryKey: ["release-progress", variables.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: releasesKey(variables.projectId),
        });
      }
    },
  });
}

export default useCreateTask;
