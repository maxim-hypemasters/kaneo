import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AgentRunnerStatus = InferResponseType<
  (typeof client)["agent"]["workspace"][":workspaceId"]["runner"]["$get"],
  200
>;

async function getAgentRunner(workspaceId: string) {
  const response = await client.agent.workspace[":workspaceId"].runner.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getAgentRunner;
