import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// null takes the task out of its release.
async function updateTaskRelease(taskId: string, releaseId: string | null) {
  const response = await client.task.release[":id"].$put({
    param: { id: taskId },
    json: { releaseId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default updateTaskRelease;
