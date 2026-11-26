import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import dismissTaskAgentSuggestion from "@/fetchers/agent/dismiss-task-agent-suggestion";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { toast } from "@/lib/toast";

type Variables = { taskId: string; suggestionId: string };

export function useDismissTaskAgentSuggestion() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, suggestionId }: Variables) =>
      dismissTaskAgentSuggestion(taskId, suggestionId),
    onError: () => {
      toast.error(t("tasks:aiAgent.errors.dismiss"));
    },
    onSettled: (_data, _error, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.task(taskId) });
    },
  });
}
