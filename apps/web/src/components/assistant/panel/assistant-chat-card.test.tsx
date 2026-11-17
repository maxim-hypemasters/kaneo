import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { AssistantTurn } from "@/hooks/use-assistant-turn";
import { AssistantChatCard } from "./assistant-chat-card";

const m = vi.hoisted(() => ({
  turn: undefined as unknown as AssistantTurn,
  pendingCount: 0,
  chatPaused: [] as boolean[],
  turnMounts: 0,
  turnUnmounts: 0,
  onDeleted: undefined as ((chatId: string) => void) | undefined,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "count" in options ? `${key}[${options.count}]` : key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@/lib/format", () => ({
  formatDateTime: () => "",
  formatRelativeTime: () => "now",
}));
vi.mock("@/hooks/use-assistant-turn", async () => {
  const { useEffect } = await import("react");
  return {
    useAssistantTurn: () => {
      useEffect(() => {
        m.turnMounts += 1;
        return () => {
          m.turnUnmounts += 1;
        };
      }, []);
      return m.turn;
    },
  };
});
vi.mock("@/hooks/queries/assistant/use-assistant-chat", () => ({
  useAssistantChat: (
    _workspaceId: string,
    chatId: string | null,
    { paused = false }: { paused?: boolean } = {},
  ) => {
    m.chatPaused.push(paused);
    return { data: chatId ? { pendingCount: m.pendingCount } : undefined };
  },
}));
vi.mock("@/hooks/mutations/assistant/use-delete-assistant-chat", () => ({
  useDeleteAssistantChat: (
    _workspaceId: string,
    options?: { onDeleted?: (chatId: string) => void },
  ) => {
    m.onDeleted = options?.onDeleted;
    return { mutate: vi.fn() };
  },
}));
vi.mock("@/hooks/queries/assistant/use-assistant-chats", () => ({
  useAssistantChats: () => ({
    isPending: false,
    isError: false,
    hasNextPage: false,
    data: {
      pages: [
        {
          chats: ["c1", "c2"].map((id) => ({
            id,
            title: `Chat ${id}`,
            updatedAt: "2026-11-17T10:00:00.000Z",
            busy: false,
            pendingCount: 0,
          })),
          nextCursor: null,
        },
      ],
    },
  }),
}));
// The real composer, without the conversation around it.
vi.mock("../conversation/assistant-conversation", async () => {
  const { Composer } = await import("../conversation/composer");
  return {
    AssistantConversation: ({
      turn,
      text,
      onTextChange,
      onMinimize,
      composerRef,
    }: {
      turn: AssistantTurn;
      text: string;
      onTextChange: Dispatch<SetStateAction<string>>;
      onMinimize?: () => void;
      composerRef: RefObject<HTMLTextAreaElement | null>;
    }) => (
      <Composer
        value={text}
        onChange={onTextChange}
        onSend={() => undefined}
        onStop={turn.stop}
        streaming={turn.isActive}
        canSend={!turn.isActive}
        textareaRef={composerRef}
        onMinimize={onMinimize}
      />
    ),
  };
});

function turn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
  return {
    phase: "idle",
    kind: null,
    chatId: null,
    pendingUserText: null,
    draft: "",
    error: null,
    truncatedChatId: null,
    stoppedChatId: null,
    isActive: false,
    start: vi.fn(async () => true),
    send: vi.fn(async () => true),
    continueTurn: vi.fn(async () => true),
    stop: vi.fn(),
    dismissError: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  m.turn = turn();
  m.pendingCount = 0;
  m.chatPaused = [];
  m.turnMounts = 0;
  m.turnUnmounts = 0;
  m.onDeleted = undefined;
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function renderCard(chatId: string | null) {
  const onSelectChat = vi.fn();
  const element = (next: string | null) => (
    <AssistantChatCard
      workspaceId="ws1"
      workspaceSlug="acme"
      chatId={next}
      model="anthropic/claude-sonnet-5.5"
      warning={null}
      canManage={false}
      onSelectChat={onSelectChat}
    />
  );
  const view = render(element(chatId));
  return {
    onSelectChat,
    rerender: (next: string | null) => view.rerender(element(next)),
    unmount: view.unmount,
  };
}

const bar = () =>
  screen.getByRole("button", {
    name: "workspace:assistant.bar.open workspace:assistant.bar.placeholder",
  });
const queryBar = () =>
  screen.queryByRole("button", { name: /^workspace:assistant\.bar\.open/ });
const region = () =>
  screen.getByRole("region", { name: "workspace:assistant.title" });
const composer = () =>
  screen.getByRole("textbox", { name: "workspace:assistant.composer.label" });
// The open chat, shown by its composer.
const queryChat = () =>
  screen.queryByRole("textbox", { name: "workspace:assistant.composer.label" });
const minimizeButton = () =>
  screen.getByRole("button", { name: "workspace:assistant.minimize" });
const chatsButton = () =>
  screen.getByRole("button", { name: "workspace:assistant.chats" });
const row = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title}`) });

describe("AssistantChatCard", () => {
  it("starts as a bar without a chat, and opens into the chat it controls", () => {
    renderCard(null);
    expect(queryChat()).toBeNull();
    expect(bar()).toHaveAttribute("aria-expanded", "false");
    const controls = bar().getAttribute("aria-controls") ?? "";

    fireEvent.click(bar());
    expect(document.getElementById(controls)).toContainElement(composer());
    expect(queryBar()).toBeNull();
    expect(composer()).toHaveFocus();
  });

  it("keeps its landmark and heading while minimized", () => {
    renderCard(null);
    expect(region()).toContainElement(bar());
    expect(
      screen.getByRole("heading", { name: "workspace:assistant.title" }),
    ).toBeInTheDocument();

    fireEvent.click(bar());
    expect(region()).toContainElement(composer());
  });

  it("starts open on a link to a chat, without taking focus", () => {
    renderCard("c2");
    expect(queryChat()).toBeInTheDocument();
    expect(queryBar()).toBeNull();
    expect(composer()).not.toHaveFocus();
  });

  it("stays minimized on coming back to a chat minimized in this tab", () => {
    const first = renderCard("c2");
    fireEvent.click(minimizeButton());
    first.unmount();

    // Back to Home, still on the same chat.
    const second = renderCard("c2");
    expect(queryChat()).toBeNull();

    // Opened again, it opens on the next visit too.
    fireEvent.click(bar());
    second.unmount();
    renderCard("c2");
    expect(queryChat()).toBeInTheDocument();
  });

  it("opens with Enter", () => {
    renderCard(null);
    fireEvent.keyDown(bar(), { key: "Enter" });
    expect(composer()).toHaveFocus();
  });

  it("opens on a character typed on the bar, for the browser to type it in the composer", () => {
    renderCard(null);
    for (const init of [
      { key: "k", ctrlKey: true },
      { key: "k", metaKey: true },
      { key: "k", altKey: true },
      { key: "Shift" },
      { key: "Tab" },
      { key: "a", isComposing: true },
      { key: "Process", keyCode: 229 },
    ]) {
      fireEvent.keyDown(bar(), init);
      expect(queryChat()).toBeNull();
    }

    // An unsent message from before, to type after.
    fireEvent.click(bar());
    fireEvent.change(composer(), { target: { value: "Half" } });
    fireEvent.click(minimizeButton());

    // Where focus is once React has handled the key, when the browser types.
    let focusedForTyping: Element | null = null;
    const whereTyped = () => {
      focusedForTyping = document.activeElement;
    };
    document.addEventListener("keydown", whereTyped);
    const notPrevented = fireEvent.keyDown(bar(), { key: "W" });
    document.removeEventListener("keydown", whereTyped);

    expect(notPrevented).toBe(true);
    expect(focusedForTyping).toBe(composer());
    expect((composer() as HTMLTextAreaElement).selectionStart).toBe(4);
  });

  it("minimizes with the Minimize button and Escape, back to the bar", () => {
    const { onSelectChat } = renderCard("c2");
    fireEvent.click(minimizeButton());
    expect(queryChat()).toBeNull();
    expect(bar()).toHaveFocus();

    fireEvent.click(bar());
    fireEvent.keyDown(composer(), { key: "Escape" });
    expect(queryChat()).toBeNull();
    expect(bar()).toHaveFocus();
    // The chat stays the open one for when it opens again.
    expect(onSelectChat).not.toHaveBeenCalled();
  });

  it("stops a streaming answer on Escape instead of minimizing", () => {
    m.turn = turn({
      phase: "streaming",
      kind: "send",
      chatId: "c2",
      isActive: true,
    });
    renderCard("c2");
    fireEvent.keyDown(composer(), { key: "Escape" });
    expect(m.turn.stop).toHaveBeenCalledTimes(1);
    expect(queryChat()).toBeInTheDocument();
  });

  it("keeps the answer running and the unsent text while minimized", () => {
    m.turn = turn({
      phase: "streaming",
      kind: "send",
      chatId: "c1",
      isActive: true,
    });
    renderCard("c2");
    fireEvent.change(composer(), { target: { value: "Half a thought" } });

    fireEvent.click(minimizeButton());
    fireEvent.click(bar());
    expect(composer()).toHaveValue("Half a thought");
    expect(m.turnMounts).toBe(1);
    expect(m.turnUnmounts).toBe(0);
    expect(m.turn.stop).not.toHaveBeenCalled();
  });

  it("says on the bar that an answer is on its way", () => {
    m.turn = turn({ phase: "streaming", kind: "start", isActive: true });
    renderCard(null);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("workspace:assistant.bar.answering");
    expect(bar()).toHaveAttribute("aria-describedby", status.id);
  });

  it("says on the bar how many changes wait in the open chat", () => {
    m.pendingCount = 2;
    const { rerender } = renderCard("c2");
    // The open chat loads itself; nothing else watches it meanwhile.
    expect(m.chatPaused).toEqual([]);

    fireEvent.click(minimizeButton());
    expect(m.chatPaused.at(-1)).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent(
      "workspace:assistant.bar.pending[2]",
    );

    rerender(null);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("toggles the history pane with its state and target announced", () => {
    renderCard("c2");
    const history = screen.getByRole("navigation", {
      name: "workspace:assistant.history.label",
    });
    expect(chatsButton()).toHaveAttribute("aria-expanded", "false");
    expect(chatsButton()).toHaveAttribute("aria-controls", history.id);

    fireEvent.click(chatsButton());
    expect(chatsButton()).toHaveAttribute("aria-expanded", "true");
    // The open chat's row takes focus.
    expect(row("Chat c2")).toHaveFocus();

    fireEvent.click(
      screen.getByRole("button", { name: "workspace:assistant.backToChat" }),
    );
    expect(chatsButton()).toHaveAttribute("aria-expanded", "false");
    expect(chatsButton()).toHaveFocus();
  });

  it("focuses the history heading when no listed chat is open", () => {
    renderCard(null);
    fireEvent.click(bar());
    fireEvent.click(chatsButton());
    expect(
      screen.getByRole("heading", { name: "workspace:assistant.chats" }),
    ).toHaveFocus();
  });

  it("leaves a chat deleted while open, even once minimized", () => {
    const { onSelectChat, unmount } = renderCard("c2");
    fireEvent.click(minimizeButton());

    m.onDeleted?.("c1");
    expect(onSelectChat).not.toHaveBeenCalled();
    m.onDeleted?.("c2");
    expect(onSelectChat).toHaveBeenCalledWith(null, { replace: true });

    // Not once Home is gone.
    onSelectChat.mockClear();
    unmount();
    m.onDeleted?.("c2");
    expect(onSelectChat).not.toHaveBeenCalled();
  });

  it("returns to the composer after picking a chat", () => {
    const { onSelectChat } = renderCard("c2");
    fireEvent.click(chatsButton());
    fireEvent.click(row("Chat c1"));

    expect(onSelectChat).toHaveBeenCalledWith("c1");
    expect(chatsButton()).toHaveAttribute("aria-expanded", "false");
    expect(composer()).toHaveFocus();
  });
});

describe("AssistantChatCard with motion", () => {
  const stubMotion = (reduce: boolean) =>
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: reduce && query.includes("prefers-reduced-motion: reduce"),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      })),
    );
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  // The window that shrinks: the inert element around the composer.
  const closingWindow = () => composer().closest("[inert]") as HTMLElement;

  it("shrinks the chat into the bar before the bar takes its place", () => {
    stubMotion(false);
    renderCard("c2");
    fireEvent.click(minimizeButton());

    // Still shrinking: the chat is there but inert, and no bar yet.
    expect(closingWindow()).not.toBeNull();
    expect(queryBar()).toBeNull();

    // Only the window's own height ending counts.
    fireEvent.transitionEnd(closingWindow(), { propertyName: "opacity" });
    fireEvent.transitionEnd(composer(), { propertyName: "height" });
    expect(queryBar()).toBeNull();

    fireEvent.transitionEnd(closingWindow(), { propertyName: "height" });
    expect(queryChat()).toBeNull();
    expect(bar()).toHaveFocus();
  });

  it("brings the bar back even when the transition never ends", () => {
    stubMotion(false);
    vi.useFakeTimers();
    renderCard("c2");
    fireEvent.click(minimizeButton());
    expect(queryBar()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(queryChat()).toBeNull();
    expect(bar()).toHaveFocus();
  });

  it("swaps straight to the bar under reduced motion", () => {
    stubMotion(true);
    renderCard("c2");
    fireEvent.click(minimizeButton());
    expect(queryChat()).toBeNull();
    expect(bar()).toHaveFocus();
  });
});
