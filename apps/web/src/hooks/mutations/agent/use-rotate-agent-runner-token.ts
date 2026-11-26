import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import rotateAgentRunnerToken from "@/fetchers/agent/rotate-agent-runner-token";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { toast } from "@/lib/toast";

// The token is returned to the caller only; it never enters the query cache,
// and gcTime 0 drops it from the mutation cache once the page unmounts.
export function useRotateAgentRunnerToken() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    gcTime: 0,
    mutationFn: (workspaceId: string) => rotateAgentRunnerToken(workspaceId),
    onSuccess: ({ status }, workspaceId) => {
      queryClient.setQueryData(agentKeys.runner(workspaceId), status);
      void queryClient.invalidateQueries({
        queryKey: agentKeys.allProjectSettings,
      });
      void queryClient.invalidateQueries({ queryKey: agentKeys.tasks });
    },
    onError: () => {
      toast.error(t("settings:aiAgentPage.toast.tokenFailed"));
    },
  });
}
