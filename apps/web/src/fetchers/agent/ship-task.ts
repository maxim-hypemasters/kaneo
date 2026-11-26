import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function shipTask(taskId: string) {
  const response = await client.agent.task[":taskId"].ship.$post({
    param: { taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default shipTask;
