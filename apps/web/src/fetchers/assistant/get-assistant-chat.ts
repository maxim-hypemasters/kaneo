import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AssistantChatDetail = InferResponseType<
  (typeof client)["assistant"][":workspaceId"]["chats"][":chatId"]["$get"],
  200
>;
export type AssistantMessage = AssistantChatDetail["messages"][number];

async function getAssistantChat(workspaceId: string, chatId: string) {
  const response = await client.assistant[":workspaceId"].chats[":chatId"].$get(
    {
      param: { workspaceId, chatId },
    },
  );

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getAssistantChat;
