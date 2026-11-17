import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AssistantChatList = InferResponseType<
  (typeof client)["assistant"][":workspaceId"]["chats"]["$get"],
  200
>;
export type AssistantChatSummary = AssistantChatList["chats"][number];

// One page of the caller's own chats, latest activity first. `before` is the
// previous page's nextCursor.
async function getAssistantChats(workspaceId: string, before?: string) {
  const response = await client.assistant[":workspaceId"].chats.$get({
    param: { workspaceId },
    // Undefined values are left out of the URL; the API defaults the limit.
    query: { limit: undefined, before },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getAssistantChats;
