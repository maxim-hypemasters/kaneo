import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type Task from "@/types/task";

export type UpdateTaskDescriptionInput = Pick<
  Task,
  "id" | "projectId" | "description"
> & {
  expectedDescription?: string;
  draftAssetIds?: string[];
};

async function updateTaskDescription(
  taskId: string,
  task: UpdateTaskDescriptionInput,
) {
  const response = await client.task.description[":id"].$put({
    param: { id: taskId },
    json: {
      description: task.description || "",
      expectedDescription: task.expectedDescription,
      draftAssetIds: task.draftAssetIds,
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default updateTaskDescription;
