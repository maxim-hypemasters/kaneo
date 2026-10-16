import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function updateTaskFeature(taskId: string, featureId: string | null) {
  const response = await client.task.feature[":id"].$put({
    param: { id: taskId },
    json: { featureId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default updateTaskFeature;
