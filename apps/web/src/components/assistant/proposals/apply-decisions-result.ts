import type { AssistantDecisionsResult } from "@/fetchers/assistant/decide-assistant-actions";
import type { AssistantChatDetail } from "@/fetchers/assistant/get-assistant-chat";

/**
 * Puts the rows a decision request returned in place in the cached chat,
 * with the chat's new pending count and whether it can continue. A row not
 * in the cached chat belongs to its older, unloaded part and is left out.
 * The request held the chat while it ran, and let go before answering.
 */
export function applyDecisionsResult(
  detail: AssistantChatDetail | undefined,
  result: AssistantDecisionsResult,
): AssistantChatDetail | undefined {
  if (!detail) return detail;
  const decided = new Map(result.messages.map((row) => [row.id, row]));
  return {
    ...detail,
    messages: detail.messages.map((row) => decided.get(row.id) ?? row),
    pendingCount: result.pendingCount,
    busy: false,
    resumable: result.resumable,
  };
}
