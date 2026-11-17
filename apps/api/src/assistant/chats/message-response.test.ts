import { describe, expect, it } from "vite-plus/test";
import {
  ERROR_TEXT_MAX_CHARS,
  type MessageDtoSource,
  toAssistantMessageDto,
} from "./message-response";

const createdAt = new Date("2026-11-16T10:00:00.000Z");

function row(overrides: Partial<MessageDtoSource>): MessageDtoSource {
  return {
    id: "m1",
    role: "user",
    content: "",
    status: "complete",
    createdAt,
    toolCalls: null,
    toolCallId: null,
    toolName: null,
    approval: null,
    isError: false,
    preview: null,
    resultSummary: null,
    ...overrides,
  };
}

describe("toAssistantMessageDto", () => {
  it("maps a user message", () => {
    expect(
      toAssistantMessageDto(row({ role: "user", content: "What is due?" })),
    ).toEqual({
      id: "m1",
      role: "user",
      content: "What is due?",
      status: "complete",
      createdAt: "2026-11-16T10:00:00.000Z",
      toolCalls: null,
      toolCallId: null,
      toolName: null,
      approval: null,
      isError: false,
      errorText: null,
      preview: null,
      resultSummary: null,
    });
  });

  it("keeps assistant text and call names but never their arguments", () => {
    const dto = toAssistantMessageDto(
      row({
        role: "assistant",
        content: "Let me check.",
        status: "interrupted",
        toolCalls: [
          { id: "c1", name: "get_task", arguments: '{"secret":"argument"}' },
        ],
      }),
    );
    expect(dto).toMatchObject({
      content: "Let me check.",
      status: "interrupted",
      toolCalls: [{ id: "c1", name: "get_task" }],
    });
    expect(JSON.stringify(dto)).not.toContain("argument");
  });

  it("sends null for an assistant row without calls", () => {
    expect(
      toAssistantMessageDto(
        row({ role: "assistant", content: "Done.", toolCalls: [] }),
      ).toolCalls,
    ).toBeNull();
  });

  it("never sends a tool row's result", () => {
    const dto = toAssistantMessageDto(
      row({
        role: "tool",
        content: '{"title":"Private roadmap"}',
        toolCallId: "c1",
        toolName: "get_project_page",
      }),
    );
    expect(dto).toMatchObject({
      role: "tool",
      content: "",
      toolCallId: "c1",
      toolName: "get_project_page",
      approval: null,
      isError: false,
      errorText: null,
    });
    expect(JSON.stringify(dto)).not.toContain("Private roadmap");
  });

  it("sends a short error for a failed tool row", () => {
    const dto = toAssistantMessageDto(
      row({
        role: "tool",
        isError: true,
        content: "get_task: 404\n  Task not found",
      }),
    );
    expect(dto).toMatchObject({
      content: "",
      isError: true,
      errorText: "get_task: 404 Task not found",
    });
  });

  it("drops the API route the tool error starts with", () => {
    const dto = toAssistantMessageDto(
      row({
        role: "tool",
        isError: true,
        content:
          "/api/task/due-date/t1: The assignee is away on 2026-12-24; choose another due date or assignee",
      }),
    );
    expect(dto.errorText).toBe(
      "The assignee is away on 2026-12-24; choose another due date or assignee",
    );
  });

  it("cuts a long error to the limit", () => {
    const dto = toAssistantMessageDto(
      row({ role: "tool", isError: true, content: "x".repeat(2000) }),
    );
    expect(dto.errorText?.length).toBe(ERROR_TEXT_MAX_CHARS);
    expect(dto.errorText?.endsWith("…")).toBe(true);
  });

  it("keeps the approval state, preview and summary of a proposal", () => {
    const preview = {
      target: "Mobile",
      targetKey: "projectId",
      fields: [{ key: "title", kind: "text" as const, value: "Fix login" }],
      diff: null,
      nested: null,
    };
    const resultSummary = {
      label: "KAN-12 Fix login",
      href: "/acme/task/KAN-12",
    };
    expect(
      toAssistantMessageDto(
        row({
          role: "tool",
          approval: "approved",
          content: '{"id":"t1"}',
          preview,
          resultSummary,
        }),
      ),
    ).toMatchObject({
      content: "",
      approval: "approved",
      preview,
      resultSummary,
    });
  });

  it("ignores tool-only columns on other roles", () => {
    expect(
      toAssistantMessageDto(
        row({
          role: "user",
          content: "Hi",
          isError: true,
          approval: "pending",
        }),
      ),
    ).toMatchObject({ isError: false, errorText: null, approval: null });
  });
});
