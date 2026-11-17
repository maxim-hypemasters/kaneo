import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import continueAssistantTurn from "@/fetchers/assistant/continue-assistant-turn";
import type {
  AssistantChatDetail,
  AssistantMessage,
} from "@/fetchers/assistant/get-assistant-chat";
import sendAssistantMessage from "@/fetchers/assistant/send-assistant-message";
import startAssistantChat from "@/fetchers/assistant/start-assistant-chat";
import { HttpError } from "@/lib/http-error";
import { useAssistantTurn } from "./use-assistant-turn";

vi.mock("@/fetchers/assistant/start-assistant-chat", () => ({
  default: vi.fn(),
}));
vi.mock("@/fetchers/assistant/send-assistant-message", () => ({
  default: vi.fn(),
}));
vi.mock("@/fetchers/assistant/continue-assistant-turn", () => ({
  default: vi.fn(),
}));

const WS = "ws1";
const chatKey = (id: string) => ["assistant", "chat", WS, id];
const chatsKey = ["assistant", "chats", WS];

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

function detail(messages: AssistantMessage[]): AssistantChatDetail {
  return {
    chat: {
      id: "c1",
      title: "Hi",
      createdAt: "2026-11-17T09:00:00.000Z",
      updatedAt: "2026-11-17T09:00:00.000Z",
    },
    messages,
    hasOlder: false,
    pendingCount: 0,
    busy: false,
    resumable: false,
  };
}

/** A streamed response the test writes events into, then ends or holds. */
function controlledStream(signal: AbortSignal) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  signal.addEventListener("abort", () =>
    controller.error(new DOMException("Aborted", "AbortError")),
  );
  return {
    response: new Response(body, {
      headers: { "Content-Type": "text/event-stream" },
    }),
    emit: (event: object) =>
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    end: () => controller.close(),
  };
}

let queryClient: QueryClient;
let stream: ReturnType<typeof controlledStream>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

/**
 * A fetch of the chat that is in flight until the test resolves it with
 * an older transcript; the returned promise settles once it has landed.
 */
function staleFetch(chatId: string) {
  let resolve!: (value: AssistantChatDetail) => void;
  const settled = queryClient
    .fetchQuery({
      queryKey: chatKey(chatId),
      queryFn: () =>
        new Promise<AssistantChatDetail>((done) => {
          resolve = done;
        }),
    })
    .catch(() => undefined);
  return async (value: AssistantChatDetail) => {
    resolve(value);
    await settled;
  };
}

function mockStreaming(fetcher: unknown) {
  vi.mocked(
    fetcher as (...args: unknown[]) => Promise<Response>,
  ).mockImplementation(async (...args: unknown[]) => {
    stream = controlledStream(args.at(-1) as AbortSignal);
    return stream.response;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient();
  queryClient.setQueryData(chatsKey, { pages: [], pageParams: [] });
});
afterEach(() => queryClient.clear());

describe("useAssistantTurn", () => {
  it("starts a chat, follows its id and streams the answer into the cache", async () => {
    mockStreaming(startAssistantChat);
    const onChatCreated = vi.fn();
    const { result } = renderHook(
      () => useAssistantTurn({ workspaceId: WS, onChatCreated }),
      { wrapper },
    );

    let accepted: Promise<boolean> = Promise.resolve(false);
    act(() => {
      accepted = result.current.start("What is due?");
    });
    expect(result.current.phase).toBe("connecting");
    expect(result.current.pendingUserText).toBe("What is due?");
    await expect(accepted).resolves.toBe(true);
    expect(vi.mocked(startAssistantChat).mock.calls[0][1]).toMatchObject({
      content: "What is due?",
    });

    await act(async () => {
      stream.emit({ type: "chat", chat: { id: "c1", title: "What is due?" } });
    });
    await waitFor(() => expect(onChatCreated).toHaveBeenCalledWith("c1"));
    expect(result.current.chatId).toBe("c1");
    // The first message shows at once, as a local row.
    expect(
      queryClient
        .getQueryData<AssistantChatDetail>(chatKey("c1"))
        ?.messages.map((message) => [message.role, message.content]),
    ).toEqual([["user", "What is due?"]]);

    await act(async () => {
      stream.emit({
        type: "message",
        message: row("u1", { role: "user", content: "What is due?" }),
      });
      stream.emit({ type: "delta", text: "Two " });
      stream.emit({ type: "delta", text: "tasks." });
    });
    await waitFor(() => expect(result.current.draft).toBe("Two tasks."));

    await act(async () => {
      stream.emit({
        type: "message",
        message: row("a1", { content: "Two tasks." }),
      });
      stream.emit({ type: "done", pendingCount: 0 });
    });
    await waitFor(() => expect(result.current.phase).toBe("idle"));

    expect(result.current.draft).toBe("");
    expect(result.current.error).toBeNull();
    expect(
      queryClient
        .getQueryData<AssistantChatDetail>(chatKey("c1"))
        ?.messages.map((message) => message.id),
    ).toEqual(["u1", "a1"]);
    expect(queryClient.getQueryState(chatsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(chatKey("c1"))?.isInvalidated).toBe(true);
  });

  it("keeps a chat fetch that started earlier from replacing the turn's rows", async () => {
    queryClient.setQueryData(
      chatKey("c1"),
      detail([row("u0", { role: "user" })]),
    );
    const landStale = staleFetch("c1");
    mockStreaming(sendAssistantMessage);
    const { result } = renderHook(() => useAssistantTurn({ workspaceId: WS }), {
      wrapper,
    });

    await act(async () => {
      await result.current.send("c1", "Next?");
    });
    await act(async () => {
      stream.emit({
        type: "message",
        message: row("u1", { role: "user", content: "Next?" }),
      });
    });
    const ids = () =>
      queryClient
        .getQueryData<AssistantChatDetail>(chatKey("c1"))
        ?.messages.map((message) => message.id);
    await waitFor(() => expect(ids()).toEqual(["u0", "u1"]));

    await act(async () => {
      await landStale(detail([row("u0", { role: "user" })]));
    });
    expect(ids()).toEqual(["u0", "u1"]);
  });

  it("cancels a fetch of a new chat when it gets its id", async () => {
    mockStreaming(startAssistantChat);
    const { result } = renderHook(() => useAssistantTurn({ workspaceId: WS }), {
      wrapper,
    });
    await act(async () => {
      await result.current.start("Hi");
    });
    const landStale = staleFetch("c1");

    await act(async () => {
      stream.emit({ type: "chat", chat: { id: "c1", title: "Hi" } });
    });
    await act(async () => {
      await landStale(detail([]));
    });

    expect(
      queryClient
        .getQueryData<AssistantChatDetail>(chatKey("c1"))
        ?.messages.map((message) => message.content),
    ).toEqual(["Hi"]);
  });

  it("gives a refused message back and drops its local row", async () => {
    queryClient.setQueryData(
      chatKey("c1"),
      detail([row("u0", { role: "user" })]),
    );
    vi.mocked(sendAssistantMessage).mockRejectedValue(
      new HttpError(409, "busy", { code: "ASSISTANT_CHAT_BUSY" }),
    );
    const { result } = renderHook(() => useAssistantTurn({ workspaceId: WS }), {
      wrapper,
    });

    let accepted: Promise<boolean> = Promise.resolve(true);
    act(() => {
      accepted = result.current.send("c1", "Again?");
    });
    expect(
      queryClient.getQueryData<AssistantChatDetail>(chatKey("c1"))?.messages,
    ).toHaveLength(2);
    await expect(accepted).resolves.toBe(false);

    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(
      queryClient
        .getQueryData<AssistantChatDetail>(chatKey("c1"))
        ?.messages.map((message) => message.id),
    ).toEqual(["u0"]);
    expect(result.current.error).toEqual({
      code: "ASSISTANT_CHAT_BUSY",
      retryable: true,
      chatId: "c1",
      canContinue: false,
    });
  });

  it("offers Continue when the stream ends without a terminal event", async () => {
    queryClient.setQueryData(
      chatKey("c1"),
      detail([row("u0", { role: "user" })]),
    );
    mockStreaming(continueAssistantTurn);
    const { result } = renderHook(() => useAssistantTurn({ workspaceId: WS }), {
      wrapper,
    });

    await act(async () => {
      await result.current.continueTurn("c1");
    });
    await act(async () => {
      stream.emit({ type: "delta", text: "Partial" });
      stream.end();
    });

    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(result.current.error).toMatchObject({
      code: "CONNECTION_LOST",
      chatId: "c1",
      canContinue: true,
    });
    expect(queryClient.getQueryState(chatKey("c1"))?.isInvalidated).toBe(true);
  });

  it("reports a stream error with Retry only when it may help", async () => {
    queryClient.setQueryData(
      chatKey("c1"),
      detail([row("u0", { role: "user" })]),
    );
    mockStreaming(sendAssistantMessage);
    const { result } = renderHook(() => useAssistantTurn({ workspaceId: WS }), {
      wrapper,
    });

    await act(async () => {
      await result.current.send("c1", "Hi");
    });
    await act(async () => {
      stream.emit({
        type: "error",
        code: "ASSISTANT_DAILY_LIMIT",
        retryable: false,
      });
    });
    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(result.current.error).toEqual({
      code: "ASSISTANT_DAILY_LIMIT",
      retryable: false,
      chatId: "c1",
      canContinue: false,
    });
  });

  it("keeps what streamed before Stop and refetches the chat shortly after", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      queryClient.setQueryData(
        chatKey("c1"),
        detail([row("u0", { role: "user" })]),
      );
      mockStreaming(continueAssistantTurn);
      const { result } = renderHook(
        () => useAssistantTurn({ workspaceId: WS }),
        { wrapper },
      );

      await act(async () => {
        await result.current.continueTurn("c1");
      });
      await act(async () => {
        stream.emit({ type: "delta", text: "Half an" });
      });
      // A second turn can't start while one runs.
      await expect(result.current.send("c1", "More")).resolves.toBe(false);

      await act(async () => {
        result.current.stop();
      });
      await vi.waitFor(() => expect(result.current.phase).toBe("idle"));

      expect(result.current.stoppedChatId).toBe("c1");
      expect(result.current.error).toBeNull();
      expect(
        queryClient
          .getQueryData<AssistantChatDetail>(chatKey("c1"))
          ?.messages.at(-1),
      ).toMatchObject({
        role: "assistant",
        content: "Half an",
        status: "interrupted",
      });
      expect(queryClient.getQueryState(chatKey("c1"))?.isInvalidated).toBe(
        false,
      );

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(queryClient.getQueryState(chatKey("c1"))?.isInvalidated).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
