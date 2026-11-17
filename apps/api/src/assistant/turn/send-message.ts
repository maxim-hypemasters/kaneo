import { and, eq } from "drizzle-orm";
import db from "../../database";
import { assistantMessageTable } from "../../database/schema";
import { acquireChatLease } from "../chats/chat-lease";
import { toAssistantMessageDto } from "../chats/message-response";
import { touchChat } from "../chats/touch-chat";
import type { AssistantMessageInput } from "../schema";
import {
  type AssistantContext,
  prepareTurn,
  releaseLeaseAfterFailure,
  streamChatTurn,
  takeTurnSlot,
} from "./turn-context";
import type { TurnSlot } from "./turn-slots";

const messages = assistantMessageTable;

export const SKIPPED_BY_NEW_MESSAGE =
  "Not run: the user sent a new message instead.";

/**
 * Proposals still waiting are skipped, since the user moved on, and the new
 * message is added after them: one transaction, so the history never shows
 * the message next to a card that is still pending. The chat moves to the
 * top of the history with it.
 */
async function skipPendingAndAddMessage(chatId: string, content: string) {
  return db.transaction(async (tx) => {
    const skipped = await tx
      .update(messages)
      .set({
        approval: "skipped",
        content: SKIPPED_BY_NEW_MESSAGE,
        decidedAt: new Date(),
      })
      .where(and(eq(messages.chatId, chatId), eq(messages.approval, "pending")))
      .returning();
    const [message] = await tx
      .insert(messages)
      .values({ chatId, role: "user", content })
      .returning();
    if (!message) throw new Error("sendMessage: the message was not inserted");
    await touchChat(chatId, tx);
    skipped.sort((a, b) => a.seq - b.seq);
    return { skipped, message };
  });
}

/**
 * POST /chats/{chatId}/messages: the next message in one of the caller's
 * chats. Taking the lease finds the chat (404) and refuses a chat that is
 * still answering (409). The stream starts with the skipped cards and the
 * new message.
 */
export async function sendMessageTurn(
  c: AssistantContext,
  chatId: string,
  body: AssistantMessageInput,
): Promise<Response> {
  const owner = {
    chatId,
    workspaceId: c.get("workspaceId"),
    userId: c.get("userId"),
  };
  const setup = await prepareTurn(c);
  const { token } = await acquireChatLease(owner);

  let slot: TurnSlot | null = null;
  try {
    slot = takeTurnSlot(owner.userId);
    const { skipped, message } = await skipPendingAndAddMessage(
      chatId,
      body.content,
    );
    return streamChatTurn(c, {
      setup,
      chatId,
      leaseToken: token,
      slot,
      timeZone: body.timeZone,
      intro: async (emit) => {
        for (const row of skipped) {
          await emit({ type: "message", message: toAssistantMessageDto(row) });
        }
        await emit({
          type: "message",
          message: toAssistantMessageDto(message),
        });
      },
    });
  } catch (error) {
    slot?.release();
    await releaseLeaseAfterFailure(chatId, token);
    throw error;
  }
}
