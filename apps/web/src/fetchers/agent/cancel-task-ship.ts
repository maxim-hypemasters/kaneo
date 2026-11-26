import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function cancelTaskShip(taskId: string) {
  const response = await client.agent.task[":taskId"].cancel.$post({
    param: { taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default cancelTaskShip;
