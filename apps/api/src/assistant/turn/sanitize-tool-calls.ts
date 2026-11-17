import { randomUUID } from "node:crypto";
import type { AssistantToolCall } from "../message-types";

// What providers accept for a tool_use name and id when the step is
// replayed. A step stored with anything else would be refused on every
// later request, leaving the chat stuck.
const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const UNNAMED_TOOL = "unknown_tool";

function safeName(name: string): string {
  if (NAME.test(name)) return name;
  return name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || UNNAMED_TOOL;
}

const freshId = () => `call_${randomUUID().replaceAll("-", "").slice(0, 24)}`;

/**
 * A step's tool calls as they are stored and replayed: names and ids that
 * a provider would refuse are replaced, and ids repeated within the step
 * get fresh ones, so each result answers exactly one call. A replaced name
 * matches no tool, so its call gets an error result the model can correct.
 */
export function sanitizeToolCalls(
  calls: readonly AssistantToolCall[],
): AssistantToolCall[] {
  const seen = new Set<string>();
  return calls.map((call) => {
    const id = ID.test(call.id) && !seen.has(call.id) ? call.id : freshId();
    seen.add(id);
    const name = safeName(call.name);
    return id === call.id && name === call.name ? call : { ...call, id, name };
  });
}

const MAX_ID_LENGTH = 64;

/**
 * `id`, or when `taken` already holds it, `id` with the first free `_<n>`
 * suffix (n from 2), cut to stay within 64 characters. Providers want call
 * ids unique across the whole history, and a step's ids are only unique
 * within it.
 */
export function uniqueToolCallId(
  id: string,
  taken: ReadonlySet<string>,
): string {
  if (!taken.has(id)) return id;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${id.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
