import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type TaskAgentAnswer = InferRequestType<
  (typeof client)["agent"]["task"][":taskId"]["answers"]["$post"]
>["json"]["answers"][number];

async function submitTaskAgentAnswers(
  taskId: string,
  answers: TaskAgentAnswer[],
) {
  const response = await client.agent.task[":taskId"].answers.$post({
    param: { taskId },
    json: { answers },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default submitTaskAgentAnswers;
