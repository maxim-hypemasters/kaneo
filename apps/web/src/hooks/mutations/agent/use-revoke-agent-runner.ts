import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import revokeAgentRunner from "@/fetchers/agent/revoke-agent-runner";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { toast } from "@/lib/toast";

export function useRevokeAgentRunner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workspaceId: string) => revokeAgentRunner(workspaceId),
    onSuccess: (_data, workspaceId) => {
      // Project settings and task views report whether a runner exists.
      for (const queryKey of [
        agentKeys.runner(workspaceId),
        agentKeys.allProjectSettings,
        agentKeys.tasks,
      ])
        void queryClient.invalidateQueries({ queryKey });
      toast.success(t("settings:aiAgentPage.toast.revoked"), {
        icon: Trash2Icon,
      });
    },
    onError: () => {
      toast.error(t("settings:aiAgentPage.toast.revokeFailed"));
    },
  });
}
