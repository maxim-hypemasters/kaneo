import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, FileTextIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import applyTaskAgentSuggestion from "@/fetchers/agent/apply-task-agent-suggestion";
import { HttpError } from "@/lib/http-error";
import {
  isTaskAssigneeAway,
  toastTaskSaveError,
} from "@/lib/time-off/task-away-error";
import { toast } from "@/lib/toast";
import { appliedSuggestionToastKey } from "./applied-suggestion-toast-key";
import { invalidateAppliedSuggestion } from "./invalidate-applied-suggestion";

type Variables = {
  taskId: string;
  suggestionId: string;
  /** Field suggestions pass it: they change what the board and lists show. */
  projectId?: string;
};

// Apply is an ordinary edit by the caller, checked against the task as it
// is now. An outdated suggestion refreshes away with the agent state.
export function useApplyTaskAgentSuggestion() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, suggestionId }: Variables) =>
      applyTaskAgentSuggestion(taskId, suggestionId),
    onSuccess: (result) => {
      toast.success(t(appliedSuggestionToastKey(result)), {
        icon: result.kind === "description" ? FileTextIcon : CheckIcon,
      });
    },
    onError: (error) => {
      const fallback = t("tasks:aiAgent.errors.apply");
      if (
        error instanceof HttpError &&
        error.code === "AI_AGENT_SUGGESTION_OUTDATED"
      )
        toast.error(t("tasks:aiAgent.errors.suggestionOutdated"));
      else if (isTaskAssigneeAway(error)) toastTaskSaveError(error, fallback);
      else toast.error(fallback);
    },
    onSettled: (result, _error, { taskId, projectId }) => {
      invalidateAppliedSuggestion(queryClient, { taskId, projectId }, result);
    },
  });
}
