import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { TaskType } from "@/types/task";

async function updateTaskType(
  taskId: string,
  type: Exclude<TaskType, "feature">,
) {
  const response = await client.task.type[":id"].$put({
    param: { id: taskId },
    json: { type },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default updateTaskType;
