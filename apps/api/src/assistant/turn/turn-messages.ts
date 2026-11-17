import { and, desc, eq, inArray, sql } from "drizzle-orm";
import db from "../../database";
import { assistantMessageTable } from "../../database/schema";
import { HISTORY_MAX_CHARS } from "../constants";
import {
  APPROVED_OUTCOME_UNKNOWN,
  OUTCOME_UNKNOWN,
} from "../proposals/execute-approved";
import { stubOnlyToolRows, type TranscriptRow } from "./build-messages";

const messages = assistantMessageTable;

export type MessageRow = typeof assistantMessageTable.$inferSelect;
export type NewMessageRow = typeof assistantMessageTable.$inferInsert;

/** A transcript row with what a write proposal checks its receipts against. */
export type TurnTranscriptRow = TranscriptRow &
  Pick<MessageRow, "seq" | "toolName" | "readReceipts">;

// The model never sees more than HISTORY_MAX_CHARS, so older rows only cost
// a bigger read: the window starts at a user row within the latest ones.
export const TRANSCRIPT_ROWS = 300;

// Everything but the content, which is read only where it can be replayed.
const outlineColumns = {
  id: messages.id,
  seq: messages.seq,
  role: messages.role,
  status: messages.status,
  model: messages.model,
  toolCalls: messages.toolCalls,
  reasoningDetails: messages.reasoningDetails,
  toolCallId: messages.toolCallId,
  toolName: messages.toolName,
  approval: messages.approval,
  isError: messages.isError,
  readReceipts: messages.readReceipts,
  // Counted in the database, so a long result never leaves it to be measured.
  contentChars: sql<number>`char_length(${messages.content})`.mapWith(Number),
  // Read here too, since a stub must say so even when the content isn't.
  outcomeUnknown: sql<boolean>`coalesce(${messages.approval} = 'approved' and ${messages.content} in (${OUTCOME_UNKNOWN}, ${APPROVED_OUTCOME_UNKNOWN}), false)`,
};

type OutlineRow = Omit<TurnTranscriptRow, "content" | "contentOmitted"> & {
  contentChars: number;
};

/**
 * The rows the transcript is built from, in seq order and without content:
 * from the oldest user row among the latest TRANSCRIPT_ROWS. When steps
 * resumed again and again pushed every user row out of them, the latest
 * user row instead, followed by those rows from their first assistant row
 * on, so no step is cut from its call. Never more than TRANSCRIPT_ROWS + 1.
 */
async function loadOutline(chatId: string): Promise<OutlineRow[]> {
  const recent = await db
    .select(outlineColumns)
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.seq))
    .limit(TRANSCRIPT_ROWS);
  recent.reverse();
  const firstUser = recent.findIndex((row) => row.role === "user");
  if (firstUser !== -1) return recent.slice(firstUser);

  const [latestUser] = await db
    .select(outlineColumns)
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "user")))
    .orderBy(desc(messages.seq))
    .limit(1);
  if (!latestUser) return [];
  const firstStep = recent.findIndex((row) => row.role === "assistant");
  return firstStep === -1
    ? [latestUser]
    : [latestUser, ...recent.slice(firstStep)];
}

/**
 * The chat's recent transcript in seq order, starting at a user row, as
 * buildMessages expects. It reads a bounded number of rows, and leaves the
 * content of tool rows the window could only stub unread: those come back
 * with empty content and contentOmitted. Empty only when the chat has no
 * user row.
 */
export async function loadTranscript(
  chatId: string,
): Promise<TurnTranscriptRow[]> {
  const outline = await loadOutline(chatId);
  if (outline.length === 0) return [];

  const omitted = stubOnlyToolRows(outline, HISTORY_MAX_CHARS);
  const wanted = outline
    .filter((row) => !omitted.has(row.id))
    .map((row) => row.id);
  const contents = new Map(
    (
      await db
        .select({ id: messages.id, content: messages.content })
        .from(messages)
        .where(and(eq(messages.chatId, chatId), inArray(messages.id, wanted)))
    ).map((row) => [row.id, row.content]),
  );

  return outline.map(({ contentChars: _chars, ...row }) =>
    omitted.has(row.id)
      ? { ...row, content: "", contentOmitted: true }
      : { ...row, content: contents.get(row.id) ?? "" },
  );
}

export async function insertMessage(
  values: NewMessageRow,
): Promise<MessageRow> {
  const [row] = await db.insert(messages).values(values).returning();
  if (!row) throw new Error("insertMessage: the row was not inserted");
  return row;
}
