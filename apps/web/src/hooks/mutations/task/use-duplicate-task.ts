import { invalidateWorkLinkCandidates } from "@/lib/invalidate-work-link-candidates";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyPlusIcon } from "lucide-react";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { useTranslation } from "react-i18next";
import duplicateTask from "@/fetchers/task/duplicate-task";
import { toast } from "@/lib/toast";

export function useDuplicateTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: duplicateTask,
    onSuccess: (task) => {
      invalidateMyWork(queryClient);
      void queryClient.invalidateQueries({
        queryKey: ["project-features", task.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["feature-library", task.projectId],
      });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("tasks:duplicate.success"), { icon: CopyPlusIcon });
      // A copy of a task joins its feature; both refresh the board.
      if (task.featureId)
        invalidateFeatureChange(queryClient, task.projectId, [task.featureId]);
      else {
        invalidateWorkLinkCandidates(queryClient, task.projectId);
        void queryClient.invalidateQueries({
          queryKey: ["releases", task.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["tasks", task.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["release-progress", task.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["feature-milestones", task.projectId],
        });
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t("tasks:duplicate.error"),
      );
    },
  });
}
