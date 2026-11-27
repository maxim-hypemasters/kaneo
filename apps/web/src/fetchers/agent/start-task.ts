import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AgentStartResult = InferResponseType<
  (typeof client)["agent"]["task"][":taskId"]["start"]["$post"],
  200
>;

async function startTask(taskId: string, body: { pullRequest: boolean }) {
  const response = await client.agent.task[":taskId"].start.$post({
    param: { taskId },
    json: body,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default startTask;
