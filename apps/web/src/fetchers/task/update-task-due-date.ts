import type Task from "@/types/task";

export default async function updateTaskDueDate(
  _taskId: string,
  _task: Task,
): Promise<Task> {
  throw new Error("Task dates are read-only; use an estimate and Preview plan");
}
