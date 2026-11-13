import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type Task from "@/types/task";

async function updateTaskDueDate(taskId: string, task: Task) {
  const response = await client.task["due-date"][":id"].$put({
    param: { id: taskId },
    json: { dueDate: task.dueDate || null },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default updateTaskDueDate;
