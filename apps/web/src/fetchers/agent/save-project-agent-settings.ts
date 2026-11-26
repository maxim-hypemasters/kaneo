import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type SaveProjectAgentSettingsInput = InferRequestType<
  (typeof client)["agent"]["project"][":projectId"]["settings"]["$put"]
>["json"];

async function saveProjectAgentSettings(
  projectId: string,
  data: SaveProjectAgentSettingsInput,
) {
  const response = await client.agent.project[":projectId"].settings.$put({
    param: { projectId },
    json: data,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default saveProjectAgentSettings;
