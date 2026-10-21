import { invalidateWorkLinkCandidates } from "@/lib/invalidate-work-link-candidates";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderInputIcon } from "lucide-react";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { useTranslation } from "react-i18next";
import moveTask from "@/fetchers/task/move-task";
import { toast } from "@/lib/toast";
import { findCachedFeatureId } from "./find-cached-feature-id";

export function useMoveTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: moveTask,
    // A task leaves its feature when it moves to another project; the answer
    // no longer names that feature.
    onMutate: ({ taskId }) => ({
      featureId: findCachedFeatureId(queryClient, taskId),
    }),
    onSuccess: (result, variables, context) => {
      invalidateMyWork(queryClient);
      for (const id of [result.sourceProjectId, result.destinationProjectId]) {
        void queryClient.invalidateQueries({
          queryKey: ["project-features", id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["feature-library", id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["feature-milestones", id],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["release-progress", result.destinationProjectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["releases", result.destinationProjectId],
      });
      invalidateWorkLinkCandidates(queryClient, result.destinationProjectId);
      void queryClient.invalidateQueries({
        queryKey: ["feature-milestones", result.destinationProjectId],
      });
      toast.success(t("tasks:move.success"), { icon: FolderInputIcon });
      queryClient.invalidateQueries({
        queryKey: ["external-links", variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task", variables.taskId],
      });
      // Both refresh the source board.
      if (context?.featureId)
        invalidateFeatureChange(queryClient, result.sourceProjectId, [
          context.featureId,
        ]);
      else {
        invalidateWorkLinkCandidates(queryClient, result.sourceProjectId);
        void queryClient.invalidateQueries({
          queryKey: ["releases", result.sourceProjectId],
        });
        queryClient.invalidateQueries({
          queryKey: ["tasks", result.sourceProjectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["release-progress", result.sourceProjectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["feature-milestones", result.sourceProjectId],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["tasks", result.destinationProjectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t("tasks:move.error"),
      );
    },
  });
}
