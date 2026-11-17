import { randomUUID } from "node:crypto";
import type { AssistantToolCall } from "../message-types";
import { fromStreamErrorChunk, type OpenRouterError } from "./openrouter-error";
import type { CompletionFinishReason, CompletionResult } from "./types";

export type DeltaAccumulator = {
  /** Merges one parsed chunk; returns its text, or the error it reports. */
  push(chunk: unknown): { text?: string; error?: OpenRouterError };
  /** Whether a chunk has carried a finish_reason yet. */
  hasFinished(): boolean;
  result(): CompletionResult;
};

type ToolCallSlot = { id: string; name: string; arguments: string };
type Entry = Record<string, unknown>;

// reasoning_details keys merged across fragments of one index: text pieces
// concatenate, and the last non-empty signature, data or id wins.
const CONCATENATED_KEYS = new Set(["text", "summary"]);
const LAST_WINS_KEYS = new Set(["signature", "data", "id"]);

const FINISH_REASONS = new Set<string>([
  "stop",
  "tool_calls",
  "length",
  "content_filter",
]);

function isEntry(value: unknown): value is Entry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Fragments carry their own index. One without a usable index (missing,
// negative such as -1, or not an integer) falls back to its position in the
// chunk's array. Slots live in a Map, so a huge index can't allocate.
function slotIndex(entry: Entry, position: number): number {
  const index = entry.index;
  return typeof index === "number" && Number.isInteger(index) && index >= 0
    ? index
    : position;
}

function sortedValues<T>(slots: Map<number, T>): T[] {
  return [...slots.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

/** Re-stringified JSON object arguments, or null when they are unusable. */
function parseArguments(raw: string): string | null {
  // A call without parameters may stream no argument text at all.
  if (raw.trim() === "") return "{}";
  try {
    const parsed: unknown = JSON.parse(raw);
    return isEntry(parsed) ? JSON.stringify(parsed) : null;
  } catch {
    return null;
  }
}

function toFinishReason(
  raw: string | null,
  hasToolCalls: boolean,
): CompletionFinishReason {
  if (raw !== null && FINISH_REASONS.has(raw)) {
    return raw as CompletionFinishReason;
  }
  return hasToolCalls ? "tool_calls" : "stop";
}

/**
 * Merges OpenRouter chat.completion.chunk objects into one completion. Pure:
 * the caller parses each SSE payload and decides what to do with errors.
 */
export function createDeltaAccumulator(): DeltaAccumulator {
  let content = "";
  let finishReason: string | null = null;
  let usage: CompletionResult["usage"] = null;
  const toolCalls = new Map<number, ToolCallSlot>();
  const reasoning = new Map<number, Entry>();

  function mergeToolCall(fragment: unknown, position: number) {
    if (!isEntry(fragment)) return;
    const index = slotIndex(fragment, position);
    const fn = isEntry(fragment.function) ? fragment.function : {};
    let slot = toolCalls.get(index);
    if (!slot) {
      slot = { id: "", name: "", arguments: "" };
      toolCalls.set(index, slot);
    }
    if (!slot.id && typeof fragment.id === "string") slot.id = fragment.id;
    if (!slot.name && typeof fn.name === "string") slot.name = fn.name;
    if (typeof fn.arguments === "string") slot.arguments += fn.arguments;
  }

  function mergeReasoning(fragment: unknown, position: number) {
    if (!isEntry(fragment)) return;
    const index = slotIndex(fragment, position);
    let slot = reasoning.get(index);
    if (!slot) {
      // No prototype, so a "__proto__" key stays plain data.
      slot = Object.create(null) as Entry;
      reasoning.set(index, slot);
    }
    for (const [key, value] of Object.entries(fragment)) {
      const current = slot[key];
      if (CONCATENATED_KEYS.has(key) && typeof value === "string") {
        slot[key] = (typeof current === "string" ? current : "") + value;
      } else if (
        LAST_WINS_KEYS.has(key) &&
        typeof value === "string" &&
        value !== ""
      ) {
        slot[key] = value;
      } else if (!Object.hasOwn(slot, key)) {
        slot[key] = value;
      }
    }
  }

  function push(chunk: unknown): { text?: string; error?: OpenRouterError } {
    if (!isEntry(chunk)) return {};
    // A mid-stream failure arrives after HTTP 200 as a top-level error,
    // usually together with finish_reason "error".
    if (chunk.error !== undefined && chunk.error !== null) {
      return { error: fromStreamErrorChunk(chunk) };
    }

    const choice =
      Array.isArray(chunk.choices) && isEntry(chunk.choices[0])
        ? chunk.choices[0]
        : null;
    if (choice?.finish_reason === "error") {
      return { error: fromStreamErrorChunk(chunk) };
    }

    if (isEntry(chunk.usage)) {
      const cost = chunk.usage.cost;
      usage = {
        promptTokens: tokenCount(chunk.usage.prompt_tokens),
        completionTokens: tokenCount(chunk.usage.completion_tokens),
        ...(typeof cost === "number" && Number.isFinite(cost)
          ? { costUsd: cost }
          : {}),
      };
    }

    let text = "";
    const delta = choice && isEntry(choice.delta) ? choice.delta : null;
    if (delta) {
      if (typeof delta.content === "string") text = delta.content;
      if (Array.isArray(delta.tool_calls)) {
        delta.tool_calls.forEach(mergeToolCall);
      }
      if (Array.isArray(delta.reasoning_details)) {
        delta.reasoning_details.forEach(mergeReasoning);
      }
    }
    content += text;

    // The usage chunk repeats finish_reason; only the first one counts.
    if (finishReason === null && typeof choice?.finish_reason === "string") {
      finishReason = choice.finish_reason;
    }
    return text ? { text } : {};
  }

  function result(): CompletionResult {
    // Arguments cut off by the token limit are never trusted, even when the
    // cut happens to leave valid JSON.
    const truncated = finishReason === "length";
    const calls: AssistantToolCall[] = [];
    for (const slot of sortedValues(toolCalls)) {
      // A call that never named its tool can be neither run nor replayed.
      if (!slot.name) continue;
      slot.id ||= `call_${randomUUID()}`;
      const args = truncated ? null : parseArguments(slot.arguments);
      calls.push({
        id: slot.id,
        name: slot.name,
        arguments: args ?? "{}",
        ...(args === null ? { invalid: true } : {}),
      });
    }
    const details = sortedValues(reasoning);
    return {
      content,
      toolCalls: calls,
      reasoningDetails: details.length > 0 ? details : null,
      finishReason: toFinishReason(finishReason, calls.length > 0),
      usage,
    };
  }

  return { push, hasFinished: () => finishReason !== null, result };
}
