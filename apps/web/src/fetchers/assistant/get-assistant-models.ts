import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AssistantModel = InferResponseType<
  (typeof client)["assistant"][":workspaceId"]["models"]["$get"],
  200
>["models"][number];

async function getAssistantModels(workspaceId: string) {
  const response = await client.assistant[":workspaceId"].models.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const { models } = await response.json();
  return models;
}

export default getAssistantModels;
