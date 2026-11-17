import { and, count, desc, eq, sql } from "drizzle-orm";
import db from "../../database";
import {
  assistantChatTable,
  assistantMessageTable,
} from "../../database/schema";
import { CHAT_MESSAGES_PAGE } from "../constants";
import { assistantError } from "../errors";
import type { AssistantChatDetail } from "../response";
import { isResumable } from "../turn/is-resumable";
import {
  ERROR_TEXT_MAX_CHARS,
  toAssistantMessageDto,
} from "./message-response";

const chats = assistantChatTable;
const messages = assistantMessageTable;

// A tool row shows at most a short error, so a read result never even
// leaves the database.
const visibleContent = sql<string>`case
  when ${messages.role} <> 'tool' then ${messages.content}
  when ${messages.isError} then left(${messages.content}, ${sql.raw(String(ERROR_TEXT_MAX_CHARS * 2))})
  else ''
end`;

/**
 * The caller's own chat with its latest messages in seq order. Throws 404
 * ASSISTANT_CHAT_NOT_FOUND for a chat of another user or workspace. While
 * an unexpired lease holds the chat it is busy, and never resumable: the
 * running turn may still add to it.
 */
export async function getChat(input: {
  chatId: string;
  workspaceId: string;
  userId: string;
  now?: Date;
}): Promise<AssistantChatDetail> {
  const now = input.now ?? new Date();
  const [chat] = await db
    .select({
      id: chats.id,
      title: chats.title,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
      busyUntil: chats.busyUntil,
    })
    .from(chats)
    .where(
      and(
        eq(chats.id, input.chatId),
        eq(chats.workspaceId, input.workspaceId),
        eq(chats.userId, input.userId),
      ),
    )
    .limit(1);
  if (!chat) throw assistantError("ASSISTANT_CHAT_NOT_FOUND");

  const latest = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: visibleContent,
      status: messages.status,
      createdAt: messages.createdAt,
      toolCalls: messages.toolCalls,
      toolCallId: messages.toolCallId,
      toolName: messages.toolName,
      approval: messages.approval,
      isError: messages.isError,
      preview: messages.preview,
      resultSummary: messages.resultSummary,
    })
    .from(messages)
    .where(eq(messages.chatId, chat.id))
    .orderBy(desc(messages.seq))
    .limit(CHAT_MESSAGES_PAGE + 1);
  const rows = latest.slice(0, CHAT_MESSAGES_PAGE).reverse();

  const [pending] = await db
    .select({ count: count() })
    .from(messages)
    .where(and(eq(messages.chatId, chat.id), eq(messages.approval, "pending")));
  const pendingCount = pending?.count ?? 0;
  const busy = chat.busyUntil !== null && chat.busyUntil > now;

  return {
    chat: {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
    },
    messages: rows.map(toAssistantMessageDto),
    hasOlder: latest.length > CHAT_MESSAGES_PAGE,
    pendingCount,
    busy,
    resumable: !busy && isResumable(rows, pendingCount),
  };
}
