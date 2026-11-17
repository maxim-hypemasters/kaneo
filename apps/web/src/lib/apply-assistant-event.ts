import type { AssistantStreamEvent } from "@/components/assistant/assistant-stream-event";
import type {
  AssistantChatDetail,
  AssistantMessage,
} from "@/fetchers/assistant/get-assistant-chat";

// Rows the browser adds before the server has saved them: the user's message
// while it is being sent, and the text of an answer stopped mid-stream. The
// server's own ids never contain a colon.
const LOCAL_PREFIX = "local:";
let localSequence = 0;

export const isLocalMessage = (message: Pick<AssistantMessage, "id">) =>
  message.id.startsWith(LOCAL_PREFIX);

const isPending = (message: AssistantMessage | undefined) =>
  message?.approval === "pending";

function localMessage(
  role: "user" | "assistant",
  content: string,
  createdAt: string,
): AssistantMessage {
  localSequence += 1;
  return {
    id: `${LOCAL_PREFIX}${role}-${localSequence}`,
    role,
    content,
    status: role === "user" ? "complete" : "interrupted",
    createdAt,
    toolCalls: null,
    toolCallId: null,
    toolName: null,
    approval: null,
    isError: false,
    errorText: null,
    preview: null,
    resultSummary: null,
  };
}

/** Shows the user's message at once, until the server's copy replaces it. */
export function addLocalUserMessage(
  detail: AssistantChatDetail | undefined,
  content: string,
  now: () => string = () => new Date().toISOString(),
): AssistantChatDetail | undefined {
  if (!detail) return detail;
  return {
    ...detail,
    messages: [...detail.messages, localMessage("user", content, now())],
  };
}

/**
 * Keeps what streamed before Stop visible until the refetch brings the
 * interrupted answer the server saved.
 */
export function addLocalStoppedAnswer(
  detail: AssistantChatDetail | undefined,
  content: string,
  now: () => string = () => new Date().toISOString(),
): AssistantChatDetail | undefined {
  if (!detail || !content.trim()) return detail;
  return {
    ...detail,
    messages: [...detail.messages, localMessage("assistant", content, now())],
  };
}

/** Drops the browser's own rows, when a request failed before streaming. */
export function removeLocalMessages(
  detail: AssistantChatDetail | undefined,
): AssistantChatDetail | undefined {
  if (!detail?.messages.some(isLocalMessage)) return detail;
  return {
    ...detail,
    messages: detail.messages.filter((row) => !isLocalMessage(row)),
  };
}

function upsertMessage(
  detail: AssistantChatDetail,
  message: AssistantMessage,
): AssistantChatDetail {
  // The server's copy of the user's message replaces the local one.
  const rows =
    message.role === "user"
      ? detail.messages.filter(
          (row) => !(isLocalMessage(row) && row.role === "user"),
        )
      : detail.messages;
  const index = rows.findIndex((row) => row.id === message.id);
  const previous = index === -1 ? undefined : rows[index];
  const messages =
    index === -1
      ? [...rows, message]
      : rows.map((row, at) => (at === index ? message : row));
  const pendingDelta = Number(isPending(message)) - Number(isPending(previous));

  return {
    ...detail,
    chat: { ...detail.chat, updatedAt: message.createdAt },
    messages,
    pendingCount: Math.max(0, detail.pendingCount + pendingDelta),
    // A turn is running; the refetch after it ends says whether it can be
    // continued.
    resumable: false,
  };
}

/**
 * Applies one stream event to a cached chat. `chat` seeds an empty chat when
 * none is cached yet; `message` inserts or replaces a row by id (a user row
 * also replaces the local copy of the message); `done`
 * records how many changes wait for approval. Text deltas and errors live in
 * the turn's own state, so they leave the chat as it is. Without a cached
 * chat to update, a row is left for the refetch that follows every turn.
 */
export function applyAssistantEvent(
  detail: AssistantChatDetail | undefined,
  event: AssistantStreamEvent,
  now: () => string = () => new Date().toISOString(),
): AssistantChatDetail | undefined {
  switch (event.type) {
    case "chat": {
      if (detail) return detail;
      const at = now();
      return {
        chat: {
          id: event.chat.id,
          title: event.chat.title,
          createdAt: at,
          updatedAt: at,
        },
        messages: [],
        hasOlder: false,
        pendingCount: 0,
        // This tab's own turn runs in it; busy marks another tab's turn.
        busy: false,
        resumable: false,
      };
    }
    case "message":
      return detail ? upsertMessage(detail, event.message) : detail;
    case "done":
      return detail
        ? { ...detail, pendingCount: event.pendingCount, resumable: false }
        : detail;
    case "delta":
    case "error":
      return detail;
  }
}
