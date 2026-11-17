import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AssistantSettings = InferResponseType<
  (typeof client)["assistant"][":workspaceId"]["settings"]["$get"],
  200
>;

async function getAssistantSettings(workspaceId: string) {
  const response = await client.assistant[":workspaceId"].settings.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getAssistantSettings;
