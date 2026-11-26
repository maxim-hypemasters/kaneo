import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileTextIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import applyTaskAgentSuggestion from "@/fetchers/agent/apply-task-agent-suggestion";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { toast } from "@/lib/toast";

type Variables = { taskId: string; suggestionId: string };

// The suggestion is appended to the description as the caller's own edit, so
// the task and its activity refresh too.
export function useApplyTaskAgentSuggestion() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, suggestionId }: Variables) =>
      applyTaskAgentSuggestion(taskId, suggestionId),
    onSuccess: () => {
      toast.success(t("tasks:aiAgent.toast.applied"), { icon: FileTextIcon });
    },
    onError: () => {
      toast.error(t("tasks:aiAgent.errors.apply"));
    },
    onSettled: (_data, _error, { taskId }) => {
      for (const queryKey of [
        agentKeys.task(taskId),
        ["task", taskId],
        ["activities", taskId],
      ])
        void queryClient.invalidateQueries({ queryKey });
    },
  });
}
