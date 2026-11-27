import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import startTask from "@/fetchers/agent/start-task";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { HttpError } from "@/lib/http-error";
import { invalidateTaskStatusChange } from "@/lib/invalidate-task-status-change";
import { toast } from "@/lib/toast";

type Variables = { taskId: string; projectId: string; pullRequest: boolean };

// The caller says what happened, since Start and Copy prompt report it
// differently.
export function useStartTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, pullRequest }: Variables) =>
      startTask(taskId, { pullRequest }),
    onError: (error) => {
      toast.error(
        t(
          error instanceof HttpError && error.code === "AI_AGENT_NOT_STARTABLE"
            ? "tasks:aiAgent.errors.notStartable"
            : "tasks:aiAgent.errors.start",
        ),
      );
    },
    // A refusal means the task changed since it was read, so it refreshes
    // either way.
    onSettled: (_data, _error, { taskId, projectId }) => {
      invalidateTaskStatusChange(queryClient, { id: taskId, projectId });
      void queryClient.invalidateQueries({ queryKey: agentKeys.task(taskId) });
    },
  });
}
