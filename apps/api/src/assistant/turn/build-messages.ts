import type { assistantMessageTable } from "../../database/schema";
import { HISTORY_MAX_CHARS } from "../constants";
import type { AssistantToolCall } from "../message-types";
import type { ChatMessage, ChatToolCall } from "../openrouter/types";
import { uniqueToolCallId } from "./sanitize-tool-calls";

/** The columns of an assistant_message row that replay needs. */
export type TranscriptRow = Pick<
  typeof assistantMessageTable.$inferSelect,
  | "id"
  | "role"
  | "content"
  | "status"
  | "model"
  | "toolCalls"
  | "reasoningDetails"
  | "toolCallId"
  | "approval"
  | "isError"
> & {
  /**
   * Set on a tool row loaded without its content (see stubOnlyToolRows):
   * it is only ever replayed as a stub.
   */
  contentOmitted?: boolean;
  /** Set on an approved write whose outcome is unknown. */
  outcomeUnknown?: boolean;
};

/** A transcript row before its content is read: its length stands in. */
export type SizedTranscriptRow = Pick<
  TranscriptRow,
  "id" | "role" | "status" | "approval" | "isError" | "outcomeUnknown"
> & {
  contentChars: number;
};

export const OMITTED_TOOL_RESULT = "[omitted, call the tool again if needed]";
export const NOT_RUN_TOOL_RESULT = "Not run: interrupted";

// What a decided write says outside the window. Never "call the tool
// again": that would repeat a change the user already decided on.
export const DECIDED_STUBS = {
  done: "Approved and done.",
  failed: "Approved; it failed.",
  unknown: "Approved; outcome unknown, check before retrying.",
  rejected: "Rejected by the user. Do not retry unless asked.",
  skipped: "Skipped.",
} as const;

/** The text a tool row is replayed as when its result is left out. */
export function toolRowStub(
  row: Pick<TranscriptRow, "approval" | "isError" | "outcomeUnknown">,
): string {
  switch (row.approval) {
    case "rejected":
      return DECIDED_STUBS.rejected;
    case "skipped":
      return DECIDED_STUBS.skipped;
    case "approved":
      if (row.outcomeUnknown) return DECIDED_STUBS.unknown;
      return row.isError ? DECIDED_STUBS.failed : DECIDED_STUBS.done;
    default:
      return OMITTED_TOOL_RESULT;
  }
}

const EMPTY_RESULT: Record<string, string> = {
  rejected: "Rejected by the user.",
  skipped: "Skipped: the user sent a new message instead of approving.",
};

type AssistantChatMessage = Extract<ChatMessage, { role: "assistant" }>;

type Item =
  | { kind: "user"; content: string }
  | { kind: "assistant"; message: AssistantChatMessage; size: number }
  | {
      kind: "tool";
      toolCallId: string;
      content: string;
      // null for a result synthesized because its row is missing.
      rowId: string | null;
      // The row's content wasn't loaded, so only a stub can stand in.
      omitted: boolean;
      // What stands in for the content outside the window.
      stub: string;
    };

/** A stored argument string, or "{}" when it isn't a JSON object. */
function replayArguments(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? raw
      : "{}";
  } catch {
    return "{}";
  }
}

function toChatToolCall(call: AssistantToolCall): ChatToolCall {
  return {
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: replayArguments(call.arguments) },
  };
}

function resultContent(row: TranscriptRow): string {
  if (row.content !== "") return row.content;
  return EMPTY_RESULT[row.approval ?? ""] ?? "(no output)";
}

function assistantItem(
  row: TranscriptRow,
  model: string,
): Extract<Item, { kind: "assistant" }> | null {
  // Interrupted rows are shown in the UI only; replaying a partial answer
  // would end the history on an assistant message.
  if (row.status !== "complete") return null;
  const calls = (row.toolCalls ?? []).map(toChatToolCall);
  const hasText = row.content.trim() !== "";
  if (!hasText && calls.length === 0) return null;

  // Reasoning is only valid for the model that produced it.
  const reasoning =
    row.model === model && row.reasoningDetails?.length
      ? row.reasoningDetails
      : null;
  const message: AssistantChatMessage = {
    role: "assistant",
    content: hasText ? row.content : null,
    ...(calls.length > 0 ? { tool_calls: calls } : {}),
    ...(reasoning ? { reasoning_details: reasoning } : {}),
  };
  const size =
    (hasText ? row.content.length : 0) +
    calls.reduce(
      (sum, call) =>
        sum + call.function.name.length + call.function.arguments.length,
      0,
    ) +
    (reasoning ? JSON.stringify(reasoning).length : 0);
  return { kind: "assistant", message, size };
}

/**
 * Flattens rows into wire order: each replayable assistant row followed by
 * exactly one result per tool call, in tool_calls order. Tool rows that
 * belong to no replayed call are dropped. A call id an earlier step already
 * used is renamed on the call and its result alike, so every id is unique
 * in the history; the stored rows keep theirs.
 */
function toItems(rows: readonly TranscriptRow[], model: string): Item[] {
  const items: Item[] = [];
  const usedIds = new Set<string>();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] as TranscriptRow;
    if (row.role === "user") {
      items.push({ kind: "user", content: row.content });
      continue;
    }
    if (row.role !== "assistant") continue;

    const assistant = assistantItem(row, model);
    if (!assistant) continue;
    items.push(assistant);

    // A step's tool rows directly follow its assistant row.
    const results: TranscriptRow[] = [];
    for (let next = index + 1; rows[next]?.role === "tool"; next++) {
      results.push(rows[next] as TranscriptRow);
    }
    const used = new Set<TranscriptRow>();
    for (const call of assistant.message.tool_calls ?? []) {
      const result = results.find(
        (candidate) => candidate.toolCallId === call.id && !used.has(candidate),
      );
      if (result) used.add(result);
      call.id = uniqueToolCallId(call.id, usedIds);
      usedIds.add(call.id);
      items.push({
        kind: "tool",
        toolCallId: call.id,
        content: result ? resultContent(result) : NOT_RUN_TOOL_RESULT,
        rowId: result?.id ?? null,
        omitted: result?.contentOmitted === true,
        stub: result ? toolRowStub(result) : OMITTED_TOOL_RESULT,
      });
    }
  }
  return items;
}

function itemSize(item: Item): number {
  return item.kind === "assistant" ? item.size : item.content.length;
}

/**
 * Fits the history into `maxChars`. Newest tool results stay whole while
 * they fit; from the first that doesn't (or whose content wasn't loaded),
 * it and every older one longer than its stub become a stub. The window
 * then starts at the oldest user message whose suffix fits, and never
 * later than the latest user message.
 */
function fitWindow(items: readonly Item[], maxChars: number) {
  const stubbed = new Set<number>();
  const sizes: number[] = [];
  let used = 0;
  let stubbing = false;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index] as Item;
    let size = itemSize(item);
    if (
      item.kind === "tool" &&
      item.rowId !== null &&
      (item.omitted ||
        (size > item.stub.length && (stubbing || used + size > maxChars)))
    ) {
      stubbing = true;
      stubbed.add(index);
      size = item.stub.length;
    }
    sizes[index] = size;
    used += size;
  }

  let start = -1;
  let suffix = 0;
  for (let index = items.length - 1; index >= 0; index--) {
    suffix += sizes[index] as number;
    if (items[index]?.kind !== "user") continue;
    if (start !== -1 && suffix > maxChars) break;
    start = index;
  }
  return { start, stubbed };
}

/**
 * Tool rows the window can only replay as stubs, judged by content lengths
 * alone, so a loader can leave their content unread and mark them
 * contentOmitted. Walking from the newest row, a tool row longer than its
 * stub is picked once the newer rows' lengths add up to more than
 * `maxChars`. buildMessages counts those newer rows at least as large (it
 * adds call arguments and reasoning), so it would stub the row too; only
 * rows it never replays, like a stray tool row, can make this pick early.
 */
export function stubOnlyToolRows(
  rows: readonly SizedTranscriptRow[],
  maxChars: number = HISTORY_MAX_CHARS,
): Set<string> {
  const picked = new Set<string>();
  let newer = 0;
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index] as SizedTranscriptRow;
    if (
      row.role === "tool" &&
      newer > maxChars &&
      row.contentChars > toolRowStub(row).length
    ) {
      picked.add(row.id);
    }
    // Interrupted answers are never replayed, so they take no room.
    if (row.role !== "assistant" || row.status === "complete") {
      newer += row.contentChars;
    }
  }
  return picked;
}

/**
 * The OpenAI-shaped messages for the next model call: the system prompt,
 * then the transcript window. `rows` is the chat's transcript in seq order
 * (the whole of it, or a suffix starting at a user row; the latest user row
 * followed by a later run of whole steps also works).
 *
 * The history never ends on an assistant message, answers every tool call
 * exactly once under an id unique in the history, and replays reasoning
 * only for `model`. Throws while a proposal is still pending, since its
 * result doesn't exist yet.
 *
 * `replayedToolRowIds` holds the tool rows whose full content is in the
 * messages, not a stub: only those can back a read receipt.
 */
export function buildMessages(
  rows: readonly TranscriptRow[],
  options: { model: string; systemPrompt: string; maxChars?: number },
): { messages: ChatMessage[]; replayedToolRowIds: Set<string> } {
  const pending = rows.find((row) => row.approval === "pending");
  if (pending) {
    throw new Error(`buildMessages: tool row ${pending.id} is still pending`);
  }

  const items = toItems(rows, options.model);
  const { start, stubbed } = fitWindow(
    items,
    options.maxChars ?? HISTORY_MAX_CHARS,
  );
  if (start === -1) {
    throw new Error("buildMessages: the transcript has no user message");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: options.systemPrompt },
  ];
  const replayedToolRowIds = new Set<string>();
  for (let index = start; index < items.length; index++) {
    const item = items[index] as Item;
    if (item.kind === "tool") {
      const isStub = stubbed.has(index);
      if (item.rowId !== null && !isStub) replayedToolRowIds.add(item.rowId);
      messages.push({
        role: "tool",
        tool_call_id: item.toolCallId,
        content: isStub ? item.stub : item.content,
      });
      continue;
    }
    if (item.kind === "assistant") {
      messages.push(item.message);
      continue;
    }
    const previous = messages.at(-1);
    // A turn that failed before any answer leaves two user rows in a row;
    // some providers need roles to alternate.
    if (previous?.role === "user") {
      previous.content = `${previous.content}\n\n${item.content}`;
    } else {
      messages.push({ role: "user", content: item.content });
    }
  }

  // A final answer is never replayed last: the next call must answer a user
  // message or tool results. Assistant rows with calls are always followed
  // by their results, so only text answers can trail.
  while (messages.length > 1 && messages.at(-1)?.role === "assistant") {
    messages.pop();
  }
  return { messages, replayedToolRowIds };
}
