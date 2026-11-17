import { describe, expect, it } from "vite-plus/test";
import type {
  AssistantChatDetail,
  AssistantMessage,
} from "@/fetchers/assistant/get-assistant-chat";
import { applyDecisionsResult } from "./apply-decisions-result";

const row = (
  id: string,
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage => ({
  id,
  role: "tool",
  content: "",
  status: "complete",
  createdAt: "2026-11-17T10:00:00.000Z",
  toolCalls: null,
  toolCallId: `call-${id}`,
  toolName: "create_task",
  approval: "pending",
  isError: false,
  errorText: null,
  preview: null,
  resultSummary: null,
  ...overrides,
});

const detail = (messages: AssistantMessage[]): AssistantChatDetail => ({
  chat: {
    id: "c1",
    title: "Hi",
    createdAt: "2026-11-17T09:00:00.000Z",
    updatedAt: "2026-11-17T09:00:00.000Z",
  },
  messages,
  hasOlder: false,
  pendingCount: 2,
  busy: true,
  resumable: false,
});

describe("applyDecisionsResult", () => {
  it("replaces the decided rows in place and takes the new counts", () => {
    const before = detail([
      row("u1", { role: "user", toolName: null, approval: null }),
      row("t1"),
      row("t2"),
    ]);
    const approved = row("t1", {
      approval: "approved",
      resultSummary: { label: "Created KAN-1 Fix", href: "/acme/task/KAN-1" },
    });
    const rejected = row("t2", { approval: "rejected" });

    const after = applyDecisionsResult(before, {
      messages: [approved, rejected],
      pendingCount: 0,
      resumable: true,
    });

    expect(after?.messages.map((message) => message.id)).toEqual([
      "u1",
      "t1",
      "t2",
    ]);
    expect(after?.messages[1]).toBe(approved);
    expect(after?.messages[2]).toBe(rejected);
    expect(after?.pendingCount).toBe(0);
    expect(after?.resumable).toBe(true);
    // A refetch during the request saw the chat held by it.
    expect(after?.busy).toBe(false);
  });

  it("leaves out rows of the unloaded part and keeps a missing chat missing", () => {
    const before = detail([row("t1")]);
    const after = applyDecisionsResult(before, {
      messages: [row("old", { approval: "rejected" })],
      pendingCount: 1,
      resumable: false,
    });
    expect(after?.messages).toEqual(before.messages);
    expect(
      applyDecisionsResult(undefined, {
        messages: [],
        pendingCount: 0,
        resumable: true,
      }),
    ).toBeUndefined();
  });
});
