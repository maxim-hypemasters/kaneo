import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import decideAssistantActions from "@/fetchers/assistant/decide-assistant-actions";
import type {
  AssistantChatDetail,
  AssistantMessage,
} from "@/fetchers/assistant/get-assistant-chat";
import { HttpError } from "@/lib/http-error";
import { useDecideAssistantActions } from "./use-decide-assistant-actions";

const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/fetchers/assistant/decide-assistant-actions", () => ({
  default: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const chatKey = ["assistant", "chat", "ws1", "c1"];
const chatsKey = ["assistant", "chats", "ws1"];
const boardKey = ["tasks", "p1"];

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
    title: "Plan",
    createdAt: "2026-11-17T09:00:00.000Z",
    updatedAt: "2026-11-17T09:00:00.000Z",
  },
  messages,
  hasOlder: false,
  pendingCount: messages.filter((message) => message.approval === "pending")
    .length,
  busy: false,
  resumable: false,
});

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  queryClient.setQueryData(chatKey, detail([row("t1"), row("t2")]));
  queryClient.setQueryData(chatsKey, { chats: [], nextCursor: null });
  queryClient.setQueryData(boardKey, []);
});
afterEach(() => queryClient.clear());

it("puts the decided rows in the chat, refreshes written work and continues", async () => {
  const created = row("t1", {
    approval: "approved",
    resultSummary: { label: "Created KAN-7 Fix", href: "/acme/task/KAN-7" },
  });
  const rejected = row("t2", { approval: "rejected" });
  vi.mocked(decideAssistantActions).mockResolvedValue({
    messages: [created, rejected],
    pendingCount: 0,
    resumable: true,
  });
  const onResumable = vi.fn();
  const { result } = renderHook(
    () => useDecideAssistantActions("ws1", { onResumable }),
    { wrapper },
  );

  await act(async () => {
    await result.current.mutateAsync({
      chatId: "c1",
      decisions: [
        { messageId: "t1", approve: true },
        { messageId: "t2", approve: false },
      ],
    });
  });

  expect(decideAssistantActions).toHaveBeenCalledWith("ws1", "c1", {
    decisions: [
      { messageId: "t1", approve: true },
      { messageId: "t2", approve: false },
    ],
  });
  const chat = queryClient.getQueryData<AssistantChatDetail>(chatKey);
  expect(chat?.messages).toEqual([created, rejected]);
  expect(chat?.pendingCount).toBe(0);
  expect(chat?.resumable).toBe(true);
  expect(queryClient.getQueryState(chatsKey)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(boardKey)?.isInvalidated).toBe(true);
  // The chat's own cache was just set, not marked stale.
  expect(queryClient.getQueryState(chatKey)?.isInvalidated).toBe(false);
  expect(onResumable).toHaveBeenCalledWith("c1");
});

it("leaves other work alone when nothing ran, and waits while cards remain", async () => {
  vi.mocked(decideAssistantActions).mockResolvedValue({
    messages: [
      row("t1", {
        approval: "approved",
        isError: true,
        errorText: "Forbidden",
      }),
    ],
    pendingCount: 1,
    resumable: false,
  });
  const onResumable = vi.fn();
  const { result } = renderHook(
    () => useDecideAssistantActions("ws1", { onResumable }),
    { wrapper },
  );

  await act(async () => {
    await result.current.mutateAsync({
      chatId: "c1",
      decisions: [{ messageId: "t1", approve: true }],
    });
  });

  expect(queryClient.getQueryState(boardKey)?.isInvalidated).toBe(false);
  expect(onResumable).not.toHaveBeenCalled();
  expect(
    queryClient.getQueryData<AssistantChatDetail>(chatKey)?.pendingCount,
  ).toBe(1);
});

it.each([
  [
    new HttpError(409, "busy", { code: "ASSISTANT_CHAT_BUSY" }),
    "workspace:assistant.proposal.toast.busy",
  ],
  [
    new HttpError(409, "none", { code: "ASSISTANT_NOTHING_PENDING" }),
    "workspace:assistant.proposal.toast.alreadyDecided",
  ],
  [
    new HttpError(404, "gone", { code: "ASSISTANT_CHAT_NOT_FOUND" }),
    "workspace:assistant.proposal.toast.failed",
  ],
])(
  "toasts a refused decision and reloads only the chat",
  async (error, key) => {
    vi.mocked(decideAssistantActions).mockRejectedValue(error);
    const { result } = renderHook(() => useDecideAssistantActions("ws1"), {
      wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          chatId: "c1",
          decisions: [{ messageId: "t1", approve: true }],
        }),
      ).rejects.toBe(error);
    });

    expect(toast.error).toHaveBeenCalledWith(key);
    expect(queryClient.getQueryState(chatKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(boardKey)?.isInvalidated).toBe(false);
  },
);

it.each([
  ["a network error", new Error("offline")],
  ["a server error", new HttpError(500, "boom")],
  ["a gateway timeout", new HttpError(504, "timeout")],
  [
    "a 4xx that is not an assistant refusal",
    new HttpError(409, "odd", { code: "toString" }),
  ],
])(
  "after %s, also refreshes work approved changes may have written",
  async (_name, error) => {
    vi.mocked(decideAssistantActions).mockRejectedValue(error);
    const { result } = renderHook(() => useDecideAssistantActions("ws1"), {
      wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          chatId: "c1",
          decisions: [{ messageId: "t1", approve: true }],
        }),
      ).rejects.toBe(error);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "workspace:assistant.proposal.toast.failed",
    );
    expect(queryClient.getQueryState(chatKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(boardKey)?.isInvalidated).toBe(true);
  },
);
