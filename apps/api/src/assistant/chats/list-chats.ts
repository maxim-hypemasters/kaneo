import { and, desc, eq, sql } from "drizzle-orm";
import db from "../../database";
import {
  assistantChatTable,
  assistantMessageTable,
} from "../../database/schema";
import type { AssistantChatList } from "../response";
import { decodeChatCursor, encodeChatCursor } from "./chat-cursor";

const chats = assistantChatTable;
const messages = assistantMessageTable;

/**
 * One page of the caller's own chats in the workspace, latest activity
 * first. Keyset paging on (updated_at, id) follows the owner index, so a
 * page costs the same however long the history is.
 */
export async function listChats(input: {
  workspaceId: string;
  userId: string;
  limit: number;
  before?: string;
  now?: Date;
}): Promise<AssistantChatList> {
  const now = input.now ?? new Date();
  const cursor = input.before ? decodeChatCursor(input.before) : null;

  const rows = await db
    .select({
      id: chats.id,
      title: chats.title,
      updatedAt: chats.updatedAt,
      busyUntil: chats.busyUntil,
      // The exact stored time; a Date would drop the microseconds.
      cursorAt: sql<string>`to_char(${chats.updatedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
      pendingCount: db.$count(
        messages,
        and(eq(messages.chatId, chats.id), eq(messages.approval, "pending")),
      ),
    })
    .from(chats)
    .where(
      and(
        eq(chats.workspaceId, input.workspaceId),
        eq(chats.userId, input.userId),
        cursor
          ? sql`(${chats.updatedAt}, ${chats.id}) < (${cursor.updatedAt}::timestamp, ${cursor.id})`
          : undefined,
      ),
    )
    .orderBy(desc(chats.updatedAt), desc(chats.id))
    .limit(input.limit + 1);

  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    chats: page.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      busy: row.busyUntil !== null && row.busyUntil > now,
      pendingCount: row.pendingCount,
    })),
    nextCursor:
      rows.length > input.limit && last
        ? encodeChatCursor({ updatedAt: last.cursorAt, id: last.id })
        : null,
  };
}
