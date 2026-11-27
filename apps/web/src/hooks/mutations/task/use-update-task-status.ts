import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskStatus from "@/fetchers/task/update-task-status";
import { invalidateTaskStatusChange } from "@/lib/invalidate-task-status-change";
import type Task from "@/types/task";

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) => updateTaskStatus(task.id, task),
    onSuccess: (_, variables) => {
      invalidateTaskStatusChange(queryClient, variables);
    },
  });
}
