import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function deleteAssistantChat(workspaceId: string, chatId: string) {
  const response = await client.assistant[":workspaceId"].chats[
    ":chatId"
  ].$delete({
    param: { workspaceId, chatId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default deleteAssistantChat;
