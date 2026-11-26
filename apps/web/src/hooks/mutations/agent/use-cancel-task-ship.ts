import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import cancelTaskShip from "@/fetchers/agent/cancel-task-ship";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { toast } from "@/lib/toast";

export function useCancelTaskShip() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => cancelTaskShip(taskId),
    onError: () => {
      toast.error(t("tasks:aiAgent.errors.cancel"));
    },
    onSettled: (_data, _error, taskId) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.task(taskId) });
    },
  });
}
