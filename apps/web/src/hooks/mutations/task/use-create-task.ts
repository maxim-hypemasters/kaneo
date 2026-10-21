import { invalidateWorkLinkCandidates } from "@/lib/invalidate-work-link-candidates";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import createTask, {
  type CreateTaskRequest,
} from "@/fetchers/task/create-task";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";
import { trackFirstTask } from "@/lib/analytics/activation";
import { HttpError } from "@/lib/http-error";

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
      milestoneId,
      featureComposition,
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
        { type, featureId, releaseId, milestoneId, featureComposition },
      ),
    onSuccess: (data, variables) => {
      invalidateWorkLinkCandidates(queryClient, variables.projectId);
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
          queryKey: ["feature-library", variables.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["project-features", variables.projectId],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["feature-milestones", variables.projectId],
      });
      if (data.releaseId || variables.milestoneId)
        void queryClient.invalidateQueries({
          queryKey: releasesKey(variables.projectId),
        });
      if (variables.featureId) {
        void queryClient.invalidateQueries({
          queryKey: ["task-relations", variables.featureId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["task", variables.featureId],
        });
      }
      if (variables.type === "feature" && variables.featureComposition) {
        for (const prefix of [
          "releases",
          "release-progress",
          "project-task-relations",
        ])
          void queryClient.invalidateQueries({
            queryKey: [prefix, variables.projectId],
          });
        void queryClient.invalidateQueries({ queryKey: ["task", data.id] });
        void queryClient.invalidateQueries({
          queryKey: ["activities", data.id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["task-relations", data.id],
        });
        for (const task of variables.featureComposition.existingTasks ?? []) {
          for (const prefix of ["task", "activities", "task-relations"])
            void queryClient.invalidateQueries({ queryKey: [prefix, task.id] });
        }
      }
      // Historical progress counts only work assigned to a release.
      if (data.releaseId) {
        void queryClient.invalidateQueries({
          queryKey: ["release-progress", variables.projectId],
        });
      }
    },
    onError: (error, variables) => {
      if (
        variables.featureComposition?.existingTasks?.length &&
        error instanceof HttpError &&
        error.status === 409
      )
        invalidateWorkLinkCandidates(queryClient, variables.projectId);
    },
  });
}

export default useCreateTask;
