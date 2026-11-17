import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AssistantMessageInput = InferRequestType<
  (typeof client)["assistant"][":workspaceId"]["chats"]["$post"]
>["json"];

// Creates a chat with its first message. Returns the raw Response so the
// caller can read its Server-Sent Events; refusals arrive as JSON errors
// before anything streams.
async function startAssistantChat(
  workspaceId: string,
  body: AssistantMessageInput,
  signal: AbortSignal,
): Promise<Response> {
  const response = await client.assistant[":workspaceId"].chats.$post(
    { param: { workspaceId }, json: body },
    { init: { signal } },
  );

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response;
}

export default startAssistantChat;
