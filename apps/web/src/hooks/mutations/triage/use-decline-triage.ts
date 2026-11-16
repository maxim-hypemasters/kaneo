import { useMutation, useQueryClient } from "@tanstack/react-query";
import declineTriageTask from "@/fetchers/triage/decline-triage-task";
import type Task from "@/types/task";
import { applyTriageResult } from "./apply-triage-result";

export function useDeclineTriage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason?: string }) =>
      declineTriageTask(taskId, reason),
    onSuccess: (task) => applyTriageResult(queryClient, task as Task),
  });
}
