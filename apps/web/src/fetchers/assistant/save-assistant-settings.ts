import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type SaveAssistantSettingsInput = InferRequestType<
  (typeof client)["assistant"][":workspaceId"]["settings"]["$put"]
>["json"];

async function saveAssistantSettings(
  workspaceId: string,
  data: SaveAssistantSettingsInput,
) {
  const response = await client.assistant[":workspaceId"].settings.$put({
    param: { workspaceId },
    json: data,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default saveAssistantSettings;
