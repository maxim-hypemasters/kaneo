import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type TaskAgentPrompt = InferResponseType<
  (typeof client)["agent"]["task"][":taskId"]["prompt"]["$get"],
  200
>;

async function getTaskAgentPrompt(taskId: string) {
  const response = await client.agent.task[":taskId"].prompt.$get({
    param: { taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getTaskAgentPrompt;
