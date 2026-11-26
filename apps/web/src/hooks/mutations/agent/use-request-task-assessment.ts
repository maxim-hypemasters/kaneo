import { useMutation, useQueryClient } from "@tanstack/react-query";
import requestTaskAssessment from "@/fetchers/agent/request-task-assessment";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";

// Silent on failure: the automatic request on open must not toast, so the
// "Check again" button reports its own errors.
export function useRequestTaskAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => requestTaskAssessment(taskId),
    onSettled: (_data, _error, taskId) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.task(taskId) });
    },
  });
}
