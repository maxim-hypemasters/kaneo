import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { AssistantMessageInput } from "./start-assistant-chat";

// Adds the next message to a chat. Returns the raw Response so the caller
// can read its Server-Sent Events.
async function sendAssistantMessage(
  workspaceId: string,
  chatId: string,
  body: AssistantMessageInput,
  signal: AbortSignal,
): Promise<Response> {
  const response = await client.assistant[":workspaceId"].chats[
    ":chatId"
  ].messages.$post(
    { param: { workspaceId, chatId }, json: body },
    { init: { signal } },
  );

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response;
}

export default sendAssistantMessage;
