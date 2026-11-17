import {
  type AssistantStreamEvent,
  isAssistantStreamErrorCode,
} from "./assistant-stream-event";

type AssistantStreamMessage = Extract<
  AssistantStreamEvent,
  { type: "message" }
>["message"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads one SSE `data:` payload as an assistant event. Returns null for
 * anything this client doesn't understand (malformed JSON, an unknown type
 * from a newer server), which the caller skips. An unknown error code still
 * ends the turn, as an internal error.
 */
export function parseAssistantStreamEvent(
  data: string,
): AssistantStreamEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  switch (value.type) {
    case "chat": {
      const chat = value.chat;
      if (!isRecord(chat) || typeof chat.id !== "string") return null;
      return {
        type: "chat",
        chat: {
          id: chat.id,
          title: typeof chat.title === "string" ? chat.title : "",
        },
      };
    }
    case "delta":
      return typeof value.text === "string"
        ? { type: "delta", text: value.text }
        : null;
    case "message": {
      const message = value.message;
      if (
        !isRecord(message) ||
        typeof message.id !== "string" ||
        typeof message.role !== "string"
      ) {
        return null;
      }
      // The server sends whole rows; only the fields used to place one
      // are checked here.
      return {
        type: "message",
        message: message as unknown as AssistantStreamMessage,
      };
    }
    case "error":
      return {
        type: "error",
        code: isAssistantStreamErrorCode(value.code)
          ? value.code
          : "ASSISTANT_INTERNAL",
        retryable: value.retryable === true,
      };
    case "done":
      return {
        type: "done",
        pendingCount:
          typeof value.pendingCount === "number" ? value.pendingCount : 0,
        ...(value.truncated === true ? { truncated: true } : {}),
      };
    default:
      return null;
  }
}
