import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import cancelTaskShip from "@/fetchers/agent/cancel-task-ship";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { invalidateTaskStatusChange } from "@/lib/invalidate-task-status-change";
import { toast } from "@/lib/toast";

type Variables = { taskId: string; projectId: string };

export function useCancelTaskShip() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId }: Variables) => cancelTaskShip(taskId),
    onError: () => {
      toast.error(t("tasks:aiAgent.errors.cancel"));
    },
    // Cancelling a queued run moves the task back to To Do, and the window
    // that cancelled gets no websocket message for its own edit.
    onSettled: (_data, _error, { taskId, projectId }) => {
      invalidateTaskStatusChange(queryClient, { id: taskId, projectId });
      void queryClient.invalidateQueries({ queryKey: agentKeys.task(taskId) });
    },
  });
}
