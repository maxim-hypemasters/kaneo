import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AssistantKeyUsage = InferResponseType<
  (typeof client)["assistant"][":workspaceId"]["settings"]["usage"]["$get"],
  200
>;

async function getAssistantKeyUsage(workspaceId: string) {
  const response = await client.assistant[":workspaceId"].settings.usage.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getAssistantKeyUsage;
