import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AssistantStatus = InferResponseType<
  (typeof client)["assistant"][":workspaceId"]["status"]["$get"],
  200
>;

async function getAssistantStatus(workspaceId: string) {
  const response = await client.assistant[":workspaceId"].status.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getAssistantStatus;
