import { and, eq } from "drizzle-orm";
import db from "../../database";
import { assistantChatTable } from "../../database/schema";
import { acquireChatLease, type ChatOwner } from "./chat-lease";

/**
 * Deletes the caller's own chat and its messages. Taking the lease first
 * means a running turn is never deleted under it: 409 ASSISTANT_CHAT_BUSY
 * while one holds the chat, 404 ASSISTANT_CHAT_NOT_FOUND for anyone else's.
 * Usage counters are kept, so deleting never resets the daily cap.
 */
export async function deleteChat(owner: ChatOwner): Promise<{ success: true }> {
  const { token } = await acquireChatLease(owner);
  await db
    .delete(assistantChatTable)
    .where(
      and(
        eq(assistantChatTable.id, owner.chatId),
        eq(assistantChatTable.busyToken, token),
      ),
    );
  return { success: true };
}
