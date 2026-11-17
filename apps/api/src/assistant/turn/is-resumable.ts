import type { assistantMessageTable } from "../../database/schema";

export type ResumableRow = Pick<
  typeof assistantMessageTable.$inferSelect,
  "role" | "status" | "toolCalls"
>;

/**
 * Whether Continue can pick the chat up again: nothing waits for approval
 * and the transcript (in seq order) stops short of a final answer. That is
 * the case after tool results, after a user message whose turn failed
 * before answering, after an interrupted answer, and after a step whose
 * tool calls never got results.
 */
export function isResumable(
  rows: readonly ResumableRow[],
  pendingCount: number,
): boolean {
  if (pendingCount > 0) return false;
  const last = rows.at(-1);
  if (!last) return false;
  if (last.role !== "assistant") return true;
  if (last.status === "interrupted") return true;
  return (last.toolCalls?.length ?? 0) > 0;
}
