import { toAssistantMessageDto } from "../chats/message-response";
import { type StartedChat, startChat } from "../chats/start-chat";
import type { AssistantMessageInput } from "../schema";
import {
  type AssistantContext,
  prepareTurn,
  releaseLeaseAfterFailure,
  streamChatTurn,
  takeTurnSlot,
} from "./turn-context";

/**
 * POST /chats: every check that can refuse the turn runs first and answers
 * JSON, so a refused request leaves no chat behind. Only then are the chat
 * and its first message created (already leased), and the stream opens with
 * the `chat` event.
 */
export async function startChatTurn(
  c: AssistantContext,
  body: AssistantMessageInput,
): Promise<Response> {
  const workspaceId = c.get("workspaceId");
  const userId = c.get("userId");
  const setup = await prepareTurn(c);
  // The slot is a check too, so it is taken before the chat exists.
  const slot = takeTurnSlot(userId);

  let started: StartedChat | null = null;
  try {
    started = await startChat({ workspaceId, userId, content: body.content });
    const { chat, message, leaseToken } = started;
    return streamChatTurn(c, {
      setup,
      chatId: chat.id,
      leaseToken,
      slot,
      timeZone: body.timeZone,
      intro: async (emit) => {
        await emit({ type: "chat", chat: { id: chat.id, title: chat.title } });
        await emit({
          type: "message",
          message: toAssistantMessageDto(message),
        });
      },
    });
  } catch (error) {
    slot.release();
    if (started) {
      await releaseLeaseAfterFailure(started.chat.id, started.leaseToken);
    }
    throw error;
  }
}
