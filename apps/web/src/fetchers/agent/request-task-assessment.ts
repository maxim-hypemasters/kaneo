import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function requestTaskAssessment(taskId: string) {
  const response = await client.agent.task[":taskId"].assess.$post({
    param: { taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default requestTaskAssessment;
