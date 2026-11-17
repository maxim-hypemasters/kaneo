import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type DecisionsRoute =
  (typeof client)["assistant"][":workspaceId"]["chats"][":chatId"]["decisions"]["$post"];

export type AssistantDecisionsInput = InferRequestType<DecisionsRoute>["json"];
export type AssistantDecision = AssistantDecisionsInput["decisions"][number];
export type AssistantDecisionsResult = InferResponseType<DecisionsRoute, 200>;

// Approves or rejects proposed changes. Approved ones run on the server, as
// the caller, before this answers.
async function decideAssistantActions(
  workspaceId: string,
  chatId: string,
  body: AssistantDecisionsInput,
) {
  const response = await client.assistant[":workspaceId"].chats[
    ":chatId"
  ].decisions.$post({ param: { workspaceId, chatId }, json: body });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default decideAssistantActions;
