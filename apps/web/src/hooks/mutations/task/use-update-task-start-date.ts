import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTask from "@/fetchers/task/update-task";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import type Task from "@/types/task";

// Sets or clears a Task/Bug's start date by hand; `task.startDate` is the
// new value.
export function useUpdateTaskStartDate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) =>
      updateTask(task.id, task, { startDate: task.startDate || null }),
    onSuccess: (_, task) => {
      invalidateMyWork(queryClient);
      for (const queryKey of [
        ["task", task.id],
        ["tasks", task.projectId],
        ["project-schedule", task.projectId],
        ["feature-milestones", task.projectId],
        ["activities", task.id],
      ])
        void queryClient.invalidateQueries({ queryKey });
    },
  });
}
