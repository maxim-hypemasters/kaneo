import { createId } from "@paralleldrive/cuid2";
import db from "../../database";
import {
  assistantChatTable,
  assistantMessageTable,
} from "../../database/schema";
import { LEASE_MS } from "../constants";
import { chatTitleFromMessage } from "../turn/chat-title";

export type StartedChat = {
  chat: typeof assistantChatTable.$inferSelect;
  message: typeof assistantMessageTable.$inferSelect;
  /** The new chat is created already leased to its first turn. */
  leaseToken: string;
};

/**
 * Creates a chat with its first user message in one transaction, so no
 * empty chat is ever left behind. Call it after every check that can
 * refuse the turn. The chat is created holding the turn lease; release it
 * with releaseChatLease(chat.id, leaseToken) when the turn ends.
 */
export async function startChat(input: {
  workspaceId: string;
  userId: string;
  content: string;
  now?: Date;
}): Promise<StartedChat> {
  const now = input.now ?? new Date();
  const leaseToken = createId();

  return db.transaction(async (tx) => {
    const [chat] = await tx
      .insert(assistantChatTable)
      .values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        title: chatTitleFromMessage(input.content),
        busyUntil: new Date(now.getTime() + LEASE_MS),
        busyToken: leaseToken,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!chat) throw new Error("startChat: the chat was not inserted");

    const [message] = await tx
      .insert(assistantMessageTable)
      .values({
        chatId: chat.id,
        role: "user",
        content: input.content,
        createdAt: now,
      })
      .returning();
    if (!message) throw new Error("startChat: the message was not inserted");

    return { chat, message, leaseToken };
  });
}
