import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RocketIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import shipTask from "@/fetchers/agent/ship-task";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { HttpError } from "@/lib/http-error";
import { invalidateTaskStatusChange } from "@/lib/invalidate-task-status-change";
import { toast } from "@/lib/toast";

type Variables = { taskId: string; projectId: string };

export function useShipTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId }: Variables) => shipTask(taskId),
    onSuccess: () => {
      toast.success(t("tasks:aiAgent.toast.shipped"), { icon: RocketIcon });
    },
    onError: (error) => {
      toast.error(
        t(
          error instanceof HttpError && error.code === "AI_AGENT_NOT_SHIPPABLE"
            ? "tasks:aiAgent.errors.notShippable"
            : "tasks:aiAgent.errors.ship",
        ),
      );
    },
    // Shipping moves the task to In Progress. A refusal means the task
    // changed since it was read, so it refreshes either way.
    onSettled: (_data, _error, { taskId, projectId }) => {
      invalidateTaskStatusChange(queryClient, { id: taskId, projectId });
      void queryClient.invalidateQueries({ queryKey: agentKeys.task(taskId) });
    },
  });
}
