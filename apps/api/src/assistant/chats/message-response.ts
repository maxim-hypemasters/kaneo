import type { assistantMessageTable } from "../../database/schema";
import type { AssistantMessageDto } from "../response";

/** The columns of an assistant_message row the web may learn about. */
export type MessageDtoSource = Pick<
  typeof assistantMessageTable.$inferSelect,
  | "id"
  | "role"
  | "content"
  | "status"
  | "createdAt"
  | "toolCalls"
  | "toolCallId"
  | "toolName"
  | "approval"
  | "isError"
  | "preview"
  | "resultSummary"
>;

export const ERROR_TEXT_MAX_CHARS = 500;

function shortError(content: string): string {
  // Tool errors start with the API route ("/api/task/…: message"); the model
  // keeps it, people only need the message.
  const line =
    content
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\/api\/\S+: /, "") || "The tool failed.";
  if (line.length <= ERROR_TEXT_MAX_CHARS) return line;
  // Drop a high surrogate the cut would leave without its pair.
  const cut = line
    .slice(0, ERROR_TEXT_MAX_CHARS - 1)
    .replace(/[\uD800-\uDBFF]$/, "");
  return `${cut.trimEnd()}…`;
}

/**
 * A transcript row as the web sees it. Tool results stay on the server:
 * a tool row shows only its approval state, preview, summary and, when it
 * failed, a short error. Reasoning and call arguments are never included.
 */
export function toAssistantMessageDto(
  row: MessageDtoSource,
): AssistantMessageDto {
  const isTool = row.role === "tool";
  const isFailedTool = isTool && row.isError;
  const calls = row.role === "assistant" ? (row.toolCalls ?? []) : [];

  return {
    id: row.id,
    role: row.role,
    content: isTool ? "" : row.content,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    toolCalls:
      calls.length > 0
        ? calls.map((call) => ({ id: call.id, name: call.name }))
        : null,
    toolCallId: isTool ? row.toolCallId : null,
    toolName: isTool ? row.toolName : null,
    approval: isTool ? row.approval : null,
    isError: isFailedTool,
    errorText: isFailedTool ? shortError(row.content) : null,
    preview: isTool ? row.preview : null,
    resultSummary: isTool ? row.resultSummary : null,
  };
}
