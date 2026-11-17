import { describe, expect, it } from "vite-plus/test";
import type {
  AssistantChatDetail,
  AssistantMessage,
} from "@/fetchers/assistant/get-assistant-chat";
import {
  addLocalStoppedAnswer,
  addLocalUserMessage,
  applyAssistantEvent,
  isLocalMessage,
  removeLocalMessages,
} from "./apply-assistant-event";

const NOW = "2026-11-17T10:00:00.000Z";
const now = () => NOW;

function message(
  id: string,
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    id,
    role: "assistant",
    content: `content ${id}`,
    status: "complete",
    createdAt: "2026-11-17T10:05:00.000Z",
    toolCalls: null,
    toolCallId: null,
    toolName: null,
    approval: null,
    isError: false,
    errorText: null,
    preview: null,
    resultSummary: null,
    ...overrides,
  };
}

function chat(overrides: Partial<AssistantChatDetail> = {}) {
  return {
    chat: {
      id: "c1",
      title: "Hello",
      createdAt: "2026-11-17T09:00:00.000Z",
      updatedAt: "2026-11-17T09:00:00.000Z",
    },
    messages: [message("m1", { role: "user" })],
    hasOlder: false,
    pendingCount: 0,
    busy: false,
    resumable: true,
    ...overrides,
  } satisfies AssistantChatDetail;
}

describe("applyAssistantEvent", () => {
  it("seeds an empty chat from the chat event", () => {
    expect(
      applyAssistantEvent(
        undefined,
        { type: "chat", chat: { id: "c9", title: "What is due?" } },
        now,
      ),
    ).toEqual({
      chat: { id: "c9", title: "What is due?", createdAt: NOW, updatedAt: NOW },
      messages: [],
      hasOlder: false,
      pendingCount: 0,
      busy: false,
      resumable: false,
    });
  });

  it("keeps a chat that is already cached on the chat event", () => {
    const cached = chat();
    expect(
      applyAssistantEvent(
        cached,
        { type: "chat", chat: { id: "c1", title: "x" } },
        now,
      ),
    ).toBe(cached);
  });

  it("appends a new message and bumps the chat's activity", () => {
    const next = applyAssistantEvent(chat(), {
      type: "message",
      message: message("m2"),
    });
    expect(next?.messages.map((row) => row.id)).toEqual(["m1", "m2"]);
    expect(next?.chat.updatedAt).toBe("2026-11-17T10:05:00.000Z");
    expect(next?.resumable).toBe(false);
  });

  it("replaces a message with the same id in place", () => {
    const pending = message("t1", {
      role: "tool",
      toolName: "create_task",
      approval: "pending",
    });
    const cached = chat({
      messages: [message("m1", { role: "user" }), pending, message("m3")],
      pendingCount: 1,
    });
    const next = applyAssistantEvent(cached, {
      type: "message",
      message: { ...pending, approval: "skipped" },
    });
    expect(next?.messages.map((row) => [row.id, row.approval])).toEqual([
      ["m1", null],
      ["t1", "skipped"],
      ["m3", null],
    ]);
    expect(next?.pendingCount).toBe(0);
  });

  it("counts a new pending proposal", () => {
    const next = applyAssistantEvent(chat(), {
      type: "message",
      message: message("t2", { role: "tool", approval: "pending" }),
    });
    expect(next?.pendingCount).toBe(1);
  });

  it("leaves a row for the refetch when no chat is cached", () => {
    expect(
      applyAssistantEvent(undefined, {
        type: "message",
        message: message("m2"),
      }),
    ).toBeUndefined();
  });

  it("records the pending count on done", () => {
    const next = applyAssistantEvent(chat(), { type: "done", pendingCount: 2 });
    expect(next).toMatchObject({ pendingCount: 2, resumable: false });
  });

  it("leaves the chat untouched for deltas and errors", () => {
    const cached = chat();
    expect(applyAssistantEvent(cached, { type: "delta", text: "Hi" })).toBe(
      cached,
    );
    expect(
      applyAssistantEvent(cached, {
        type: "error",
        code: "OPENROUTER_UNAVAILABLE",
        retryable: true,
      }),
    ).toBe(cached);
  });
});

describe("local rows", () => {
  it("shows the user's message until the server's copy replaces it", () => {
    const withLocal = addLocalUserMessage(chat(), "What is due?", now);
    expect(withLocal?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "What is due?",
      status: "complete",
      createdAt: NOW,
    });
    const local = withLocal?.messages.at(-1);
    expect(local && isLocalMessage(local)).toBe(true);

    const saved = applyAssistantEvent(withLocal, {
      type: "message",
      message: message("m2", { role: "user", content: "What is due?" }),
    });
    expect(saved?.messages.map((row) => row.id)).toEqual(["m1", "m2"]);
  });

  it("keeps a stopped answer's text as an interrupted row", () => {
    expect(
      addLocalStoppedAnswer(chat(), "Half an answer", now)?.messages.at(-1),
    ).toMatchObject({
      role: "assistant",
      content: "Half an answer",
      status: "interrupted",
    });
    const cached = chat();
    expect(addLocalStoppedAnswer(cached, "  ", now)).toBe(cached);
  });

  it("drops local rows when a request fails before streaming", () => {
    const withLocal = addLocalUserMessage(chat(), "Hi", now);
    expect(
      removeLocalMessages(withLocal)?.messages.map((row) => row.id),
    ).toEqual(["m1"]);
    const cached = chat();
    expect(removeLocalMessages(cached)).toBe(cached);
    expect(addLocalUserMessage(undefined, "Hi", now)).toBeUndefined();
  });
});
