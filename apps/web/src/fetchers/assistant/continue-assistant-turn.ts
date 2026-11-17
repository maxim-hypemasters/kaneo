import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AssistantContinueInput = InferRequestType<
  (typeof client)["assistant"][":workspaceId"]["chats"][":chatId"]["continue"]["$post"]
>["json"];

// Resumes a chat where its answer stopped. Returns the raw Response so the
// caller can read its Server-Sent Events.
async function continueAssistantTurn(
  workspaceId: string,
  chatId: string,
  body: AssistantContinueInput,
  signal: AbortSignal,
): Promise<Response> {
  const response = await client.assistant[":workspaceId"].chats[
    ":chatId"
  ].continue.$post(
    { param: { workspaceId, chatId }, json: body },
    { init: { signal } },
  );

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response;
}

export default continueAssistantTurn;
