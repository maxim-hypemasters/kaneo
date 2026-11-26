import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type ProjectAgentSettings = InferResponseType<
  (typeof client)["agent"]["project"][":projectId"]["settings"]["$get"],
  200
>;

async function getProjectAgentSettings(projectId: string) {
  const response = await client.agent.project[":projectId"].settings.$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getProjectAgentSettings;
