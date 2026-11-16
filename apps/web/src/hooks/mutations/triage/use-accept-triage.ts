import { useMutation, useQueryClient } from "@tanstack/react-query";
import acceptTriageTask from "@/fetchers/triage/accept-triage-task";
import type Task from "@/types/task";
import { applyTriageResult } from "./apply-triage-result";

export function useAcceptTriage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => acceptTriageTask(taskId),
    onSuccess: (task) => applyTriageResult(queryClient, task as Task),
  });
}
