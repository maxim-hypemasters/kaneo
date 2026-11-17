import { describe, expect, it } from "vite-plus/test";
import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";
import { buildConversationItems } from "./build-conversation-items";

function row(
  id: string,
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    id,
    role: "assistant",
    content: "",
    status: "complete",
    createdAt: "2026-11-17T10:00:00.000Z",
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

const user = (id: string) => row(id, { role: "user", content: "Question" });
const calls = (id: string, ...names: string[]) =>
  row(id, {
    toolCalls: names.map((name, index) => ({ id: `${id}-c${index}`, name })),
  });
const result = (callId: string, overrides: Partial<AssistantMessage> = {}) =>
  row(`r-${callId}`, {
    role: "tool",
    toolCallId: callId,
    toolName: "list_projects",
    ...overrides,
  });

const shape = (items: ReturnType<typeof buildConversationItems>) =>
  items.map((item) =>
    item.kind === "steps"
      ? [item.kind, item.steps.map((step) => `${step.name}:${step.status}`)]
      : [item.kind, item.id],
  );

describe("buildConversationItems", () => {
  it("joins tool rows to their calls and groups reads in a row", () => {
    const messages = [
      user("u1"),
      calls("a1", "list_projects", "search"),
      result("a1-c0"),
      result("a1-c1", { isError: true, errorText: "Not found" }),
      calls("a2", "get_task"),
      result("a2-c0"),
      row("a3", { content: "Here you go." }),
    ];
    const items = buildConversationItems(messages, { running: false });
    expect(shape(items)).toEqual([
      ["user", "u1"],
      ["steps", ["list_projects:done", "search:error", "get_task:done"]],
      ["answer", "a3"],
    ]);
    const steps = items[1];
    expect(steps.kind === "steps" && steps.steps[1].errorText).toBe(
      "Not found",
    );
  });

  it("splits steps around text and starts a new run after it", () => {
    const messages = [
      user("u1"),
      calls("a1", "list_projects"),
      result("a1-c0"),
      row("a2", {
        content: "Let me look closer.",
        toolCalls: [{ id: "a2-c0", name: "get_project" }],
      }),
      result("a2-c0"),
    ];
    expect(shape(buildConversationItems(messages, { running: false }))).toEqual(
      [
        ["user", "u1"],
        ["steps", ["list_projects:done"]],
        ["answer", "a2"],
        ["steps", ["get_project:done"]],
      ],
    );
  });

  it("shows a call without its row as running while streaming, else stopped", () => {
    const messages = [user("u1"), calls("a1", "list_tasks")];
    expect(shape(buildConversationItems(messages, { running: true }))).toEqual([
      ["user", "u1"],
      ["steps", ["list_tasks:running"]],
    ]);
    expect(shape(buildConversationItems(messages, { running: false }))).toEqual(
      [
        ["user", "u1"],
        ["steps", ["list_tasks:stopped"]],
      ],
    );
  });

  it("shows write rows as proposals that break a run of reads", () => {
    const messages = [
      user("u1"),
      calls("a1", "list_projects", "create_task", "get_project"),
      result("a1-c0"),
      result("a1-c1", { toolName: "create_task", approval: "pending" }),
      result("a1-c2", { toolName: "get_project" }),
    ];
    expect(shape(buildConversationItems(messages, { running: false }))).toEqual(
      [
        ["user", "u1"],
        ["steps", ["list_projects:done"]],
        ["proposal", "r-a1-c1"],
        ["steps", ["get_project:done"]],
      ],
    );
  });

  it("joins each call to the rows right after its step when ids repeat", () => {
    const step = (id: string, name: string) =>
      row(id, { toolCalls: [{ id: "call_0", name }] });
    const messages = [
      user("u1"),
      step("a1", "list_projects"),
      row("r1", {
        role: "tool",
        toolCallId: "call_0",
        toolName: "list_projects",
        isError: true,
        errorText: "Timed out",
      }),
      step("a2", "get_project"),
      row("r2", {
        role: "tool",
        toolCallId: "call_0",
        toolName: "get_project",
      }),
      step("a3", "list_tasks"),
    ];
    const items = buildConversationItems(messages, { running: true });
    expect(shape(items)).toEqual([
      ["user", "u1"],
      [
        "steps",
        ["list_projects:error", "get_project:done", "list_tasks:running"],
      ],
    ]);
    const steps = items[1];
    const ids = steps.kind === "steps" ? steps.steps.map((s) => s.id) : [];
    expect(new Set(ids).size).toBe(3);
  });

  it("shows a step's rows that no call claims after its calls", () => {
    const messages = [
      user("u1"),
      calls("a1", "list_projects"),
      result("other-call", { toolName: "search" }),
      result("a1-c0"),
    ];
    expect(shape(buildConversationItems(messages, { running: false }))).toEqual(
      [
        ["user", "u1"],
        ["steps", ["list_projects:done", "search:done"]],
      ],
    );
  });

  it("keeps a tool row whose call is not loaded", () => {
    const messages = [
      result("old-call", { toolName: "get_release" }),
      row("a2", { content: "Done." }),
    ];
    expect(shape(buildConversationItems(messages, { running: false }))).toEqual(
      [
        ["steps", ["get_release:done"]],
        ["answer", "a2"],
      ],
    );
  });

  it("keeps interrupted answers and skips empty ones", () => {
    const messages = [
      user("u1"),
      row("a1", { content: "Half", status: "interrupted" }),
      row("a2", { content: "   " }),
    ];
    expect(shape(buildConversationItems(messages, { running: false }))).toEqual(
      [
        ["user", "u1"],
        ["answer", "a1"],
      ],
    );
  });
});
