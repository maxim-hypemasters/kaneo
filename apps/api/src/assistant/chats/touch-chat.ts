import { eq } from "drizzle-orm";
import db from "../../database";
import { assistantChatTable } from "../../database/schema";
import type { DbOrTx } from "../../project-access/db-or-tx";

/**
 * Records activity in the chat, which moves it to the top of the history
 * list: a new user message (inside its transaction), a Continue that passed
 * its checks, or an approval claimed to run. Taking, renewing and releasing
 * the lease never change updated_at.
 */
export async function touchChat(
  chatId: string,
  executor: DbOrTx = db,
  now: Date = new Date(),
): Promise<void> {
  await executor
    .update(assistantChatTable)
    .set({ updatedAt: now })
    .where(eq(assistantChatTable.id, chatId));
}
