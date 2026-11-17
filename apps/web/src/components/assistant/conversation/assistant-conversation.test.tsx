import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type {
  AssistantChatDetail,
  AssistantMessage,
} from "@/fetchers/assistant/get-assistant-chat";
import type { AssistantDecisionsResult } from "@/fetchers/assistant/decide-assistant-actions";
import type { DecideVariables } from "@/hooks/mutations/assistant/use-decide-assistant-actions";
import type { AssistantTurn } from "@/hooks/use-assistant-turn";
import { AssistantConversation } from "./assistant-conversation";

type DecideMock = {
  isPending: boolean;
  variables: DecideVariables | undefined;
  mutate: (
    variables: DecideVariables,
    options?: { onSuccess?: (result: AssistantDecisionsResult) => void },
  ) => void;
};

const m = vi.hoisted(() => ({
  chat: undefined as AssistantChatDetail | undefined,
  refetch: (() => undefined) as () => unknown,
  decide: undefined as unknown as DecideMock,
  onResumable: undefined as ((chatId: string) => void) | undefined,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options?.model) return `${key}:${options.model}`;
      if (options && "target" in options) return `${key}[${options.target}]`;
      if (options && "count" in options) return `${key}[${options.count}]`;
      return key;
    },
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@/hooks/mutations/assistant/use-decide-assistant-actions", () => ({
  useDecideAssistantActions: (
    _workspaceId: string,
    options?: { onResumable?: (chatId: string) => void },
  ) => {
    m.onResumable = options?.onResumable;
    return m.decide;
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => (
    <div data-slot="scroll-area-viewport">{children}</div>
  ),
}));
vi.mock("@/hooks/queries/assistant/use-assistant-chat", () => ({
  useAssistantChat: () => ({
    data: m.chat,
    isError: false,
    error: null,
    refetch: m.refetch,
  }),
}));

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

function chat(
  messages: AssistantMessage[],
  overrides: Partial<AssistantChatDetail> = {},
): AssistantChatDetail {
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
    ...overrides,
  };
}

function idleTurn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
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

function renderConversation(chatId: string | null, turn: AssistantTurn) {
  return render(
    <AssistantConversation
      workspaceId="ws1"
      workspaceSlug="acme"
      chatId={chatId}
      model="anthropic/claude-sonnet-5.5"
      turn={turn}
      onNewChat={vi.fn()}
    />,
  );
}

const textbox = () =>
  screen.getByRole("textbox", { name: "workspace:assistant.composer.label" });

beforeEach(() => {
  m.chat = undefined;
  m.refetch = vi.fn();
  m.decide = { isPending: false, variables: undefined, mutate: vi.fn() };
  m.onResumable = undefined;
});

function pendingCard(id: string, target: string): AssistantMessage {
  return row(id, {
    role: "tool",
    toolCallId: `call-${id}`,
    toolName: "create_task",
    approval: "pending",
    preview: {
      target,
      targetKey: "projectId",
      fields: [{ key: "title", kind: "text", value: `Task ${id}` }],
      diff: null,
      nested: null,
    },
  });
}

const cardTitle = (target: string) =>
  `workspace:assistant.proposal.title.createTask[${target}]`;
afterEach(cleanup);

describe("AssistantConversation", () => {
  it("offers suggestions that fill the composer without sending", () => {
    const turn = idleTurn();
    renderConversation(null, turn);

    expect(
      screen.getByText(
        "workspace:assistant.empty.disclosure:anthropic/claude-sonnet-5.5",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace:assistant.empty.suggestions.openBugs",
      }),
    );
    expect(textbox()).toHaveValue(
      "workspace:assistant.empty.suggestions.openBugs",
    );
    expect(textbox()).toHaveFocus();
    expect(turn.start).not.toHaveBeenCalled();
  });

  it("starts a new chat with the typed message", () => {
    const turn = idleTurn();
    renderConversation(null, turn);
    fireEvent.change(textbox(), { target: { value: "  What is due?  " } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(turn.start).toHaveBeenCalledWith("What is due?");
    expect(textbox()).toHaveValue("");
  });

  it("shows the conversation as a log with steps, answers and proposals", () => {
    m.chat = chat([
      row("u1", { role: "user", content: "Open bugs?" }),
      row("a1", { toolCalls: [{ id: "call-1", name: "list_tasks" }] }),
      row("t1", { role: "tool", toolCallId: "call-1", toolName: "list_tasks" }),
      row("a2", { content: "There are **two**." }),
      pendingCard("t2", "Mobile"),
    ]);
    renderConversation("c1", idleTurn());

    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveTextContent("Open bugs?");
    expect(log.querySelector("strong")).toHaveTextContent("two");
    expect(log).toHaveTextContent("workspace:assistant.tools.listTasks");
    expect(
      within(log).getByRole("group", { name: cardTitle("Mobile") }),
    ).toHaveTextContent("Task t2");
  });

  it("decides one card for this chat, and warns that a message skips it", () => {
    m.chat = chat(
      [
        row("u1", { role: "user", content: "Plan" }),
        pendingCard("t1", "Mobile"),
      ],
      { pendingCount: 1 },
    );
    renderConversation("c1", idleTurn());

    // One waiting change needs no batch bar.
    expect(
      screen.queryByRole("button", {
        name: "workspace:assistant.proposal.batch.approveAll",
      }),
    ).toBeNull();
    expect(
      screen.getByText("workspace:assistant.composer.skipsPending[1]"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole("group", { name: cardTitle("Mobile") }),
      ).getByRole("button", { name: "workspace:assistant.proposal.approve" }),
    );
    expect(m.decide.mutate).toHaveBeenCalledWith(
      {
        chatId: "c1",
        decisions: [{ messageId: "t1", approve: true }],
      },
      expect.anything(),
    );
  });

  it("offers Approve all from two waiting changes on", () => {
    m.chat = chat(
      [
        row("u1", { role: "user", content: "Plan" }),
        pendingCard("t1", "Mobile"),
        pendingCard("t2", "Web"),
        row("t0", {
          role: "tool",
          toolName: "create_task",
          approval: "rejected",
        }),
      ],
      { pendingCount: 2 },
    );
    renderConversation("c1", idleTurn());

    expect(
      screen.getByRole("group", {
        name: "workspace:assistant.proposal.batch.waiting[2]",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace:assistant.proposal.batch.rejectAll",
      }),
    );
    expect(m.decide.mutate).toHaveBeenCalledWith(
      {
        chatId: "c1",
        decisions: [
          { messageId: "t1", approve: false },
          { messageId: "t2", approve: false },
        ],
      },
      expect.anything(),
    );
  });

  it("disables every card while a decision is on its way", () => {
    m.chat = chat(
      [
        row("u1", { role: "user", content: "Plan" }),
        pendingCard("t1", "Mobile"),
        pendingCard("t2", "Web"),
      ],
      { pendingCount: 2 },
    );
    m.decide = {
      isPending: true,
      variables: {
        chatId: "c1",
        decisions: [{ messageId: "t1", approve: true }],
      },
      mutate: vi.fn(),
    };
    const turn = idleTurn();
    renderConversation("c1", turn);

    for (const button of screen.getAllByRole("button", {
      name: /workspace:assistant\.proposal\.(approve|reject|batch\.)/,
    })) {
      expect(button).toBeDisabled();
    }
    expect(
      within(
        screen.getByRole("group", { name: cardTitle("Mobile") }),
      ).getByRole(
        "button",
        // A loading button's name ends with its spinner's.
        { name: /^workspace:assistant\.proposal\.approve/ },
      ),
    ).toHaveAttribute("data-loading");
    // Nothing new is sent meanwhile.
    fireEvent.change(textbox(), { target: { value: "More?" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(turn.send).not.toHaveBeenCalled();
  });

  it("continues the answer once nothing waits", () => {
    m.chat = chat([row("u1", { role: "user", content: "Plan" })]);
    const turn = idleTurn();
    renderConversation("c1", turn);
    m.onResumable?.("c1");
    expect(turn.continueTurn).toHaveBeenCalledWith("c1");
  });

  it("moves focus to the next waiting card, then to the composer", () => {
    const first = pendingCard("t1", "Mobile");
    const second = pendingCard("t2", "Web");
    m.chat = chat(
      [row("u1", { role: "user", content: "Plan" }), first, second],
      {
        pendingCount: 2,
      },
    );
    m.decide = {
      isPending: true,
      variables: {
        chatId: "c1",
        decisions: [{ messageId: "t1", approve: true }],
      },
      mutate: vi.fn(),
    };
    const turn = idleTurn();
    const view = renderConversation("c1", turn);

    // The first card was approved; the second still waits.
    m.chat = chat(
      [
        row("u1", { role: "user", content: "Plan" }),
        {
          ...first,
          approval: "approved",
          resultSummary: { label: "Done", href: null },
        },
        second,
      ],
      { pendingCount: 1 },
    );
    m.decide = { isPending: false, variables: undefined, mutate: vi.fn() };
    view.rerender(
      <AssistantConversation
        workspaceId="ws1"
        workspaceSlug="acme"
        chatId="c1"
        model="anthropic/claude-sonnet-5.5"
        turn={turn}
        onNewChat={vi.fn()}
      />,
    );
    // Its heading, so its changes are read before anything is approved.
    expect(document.activeElement).toBe(
      within(screen.getByRole("group", { name: cardTitle("Web") })).getByRole(
        "heading",
        { name: cardTitle("Web") },
      ),
    );

    // The last one was rejected; the composer takes focus.
    m.decide = {
      isPending: true,
      variables: {
        chatId: "c1",
        decisions: [{ messageId: "t2", approve: false }],
      },
      mutate: vi.fn(),
    };
    view.rerender(
      <AssistantConversation
        workspaceId="ws1"
        workspaceSlug="acme"
        chatId="c1"
        model="anthropic/claude-sonnet-5.5"
        turn={turn}
        onNewChat={vi.fn()}
      />,
    );
    m.chat = chat(
      [
        row("u1", { role: "user", content: "Plan" }),
        {
          ...first,
          approval: "approved",
          resultSummary: { label: "Done", href: null },
        },
        { ...second, approval: "rejected" },
      ],
      { pendingCount: 0 },
    );
    m.decide = { isPending: false, variables: undefined, mutate: vi.fn() };
    view.rerender(
      <AssistantConversation
        workspaceId="ws1"
        workspaceSlug="acme"
        chatId="c1"
        model="anthropic/claude-sonnet-5.5"
        turn={turn}
        onNewChat={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(textbox());
  });

  it("announces only failures decided here, not ones loaded with the chat", () => {
    const failed = (card: AssistantMessage): AssistantMessage => ({
      ...card,
      approval: "approved",
      isError: true,
      errorText: "Forbidden",
    });
    const older = failed(pendingCard("t0", "Docs"));
    const waiting = pendingCard("t1", "Mobile");
    m.chat = chat(
      [row("u1", { role: "user", content: "Plan" }), older, waiting],
      { pendingCount: 1 },
    );
    m.decide = {
      isPending: false,
      variables: undefined,
      mutate: vi.fn((_variables, options) =>
        options?.onSuccess?.({
          messages: [failed(waiting)],
          pendingCount: 0,
          resumable: false,
        }),
      ),
    };
    const turn = idleTurn();
    const view = renderConversation("c1", turn);
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: cardTitle("Mobile") }),
      ).getByRole("button", { name: "workspace:assistant.proposal.approve" }),
    );
    m.chat = chat([
      row("u1", { role: "user", content: "Plan" }),
      older,
      failed(waiting),
    ]);
    view.rerender(
      <AssistantConversation
        workspaceId="ws1"
        workspaceSlug="acme"
        chatId="c1"
        model="anthropic/claude-sonnet-5.5"
        turn={turn}
        onNewChat={vi.fn()}
      />,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(
      within(
        screen.getByRole("group", { name: cardTitle("Mobile") }),
      ).getByRole("alert"),
    ).toHaveTextContent("workspace:assistant.proposal.failed");
  });

  it("shows the streaming answer, and Stop stops it", () => {
    m.chat = chat([row("u1", { role: "user", content: "Hi" })]);
    const turn = idleTurn({
      phase: "streaming",
      kind: "send",
      chatId: "c1",
      isActive: true,
      draft: "Hel",
    });
    renderConversation("c1", turn);

    expect(screen.getByRole("log")).toHaveTextContent("Hel");
    expect(screen.getByRole("status")).toHaveTextContent(
      "workspace:assistant.status.answering",
    );
    expect(screen.getByText("Hel").closest("[aria-busy]")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "workspace:assistant.composer.stop" }),
    );
    expect(turn.stop).toHaveBeenCalled();
  });

  it("shows Thinking until the first words arrive", () => {
    m.chat = chat([row("u1", { role: "user", content: "Hi" })]);
    renderConversation(
      "c1",
      idleTurn({
        phase: "streaming",
        kind: "send",
        chatId: "c1",
        isActive: true,
      }),
    );
    expect(
      screen.getByText("workspace:assistant.conversation.thinking"),
    ).toBeInTheDocument();
  });

  it("reports a failed answer with Retry that continues the chat", () => {
    m.chat = chat([row("u1", { role: "user", content: "Hi" })], {
      resumable: true,
    });
    const turn = idleTurn({
      chatId: "c1",
      kind: "send",
      error: {
        code: "OPENROUTER_UNAVAILABLE",
        retryable: true,
        chatId: "c1",
        canContinue: true,
      },
    });
    renderConversation("c1", turn);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "workspace:assistant.errors.unavailable",
    );
    // The error's Retry replaces the separate Continue prompt.
    expect(
      screen.queryByText("workspace:assistant.conversation.resumePrompt"),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace:assistant.conversation.retry",
      }),
    );
    expect(turn.continueTurn).toHaveBeenCalledWith("c1");
  });

  it("offers Continue for a stopped or unfinished answer", () => {
    m.chat = chat([
      row("u1", { role: "user", content: "Hi" }),
      row("a1", { content: "Half", status: "interrupted" }),
    ]);
    const turn = idleTurn();
    renderConversation("c1", turn);

    expect(
      screen.getByText("workspace:assistant.conversation.stopped"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace:assistant.conversation.continue",
      }),
    );
    expect(turn.continueTurn).toHaveBeenCalledWith("c1");
  });

  it("doesn't send to an open chat until it has loaded", () => {
    const turn = idleTurn();
    renderConversation("c1", turn);
    expect(
      screen.getByText("workspace:assistant.conversation.loading"),
    ).toBeInTheDocument();
    fireEvent.change(textbox(), { target: { value: "Hi" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(turn.send).not.toHaveBeenCalled();
    expect(textbox()).toHaveValue("Hi");
  });

  it("says another tab is answering instead of offering Continue", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      m.chat = chat(
        [
          row("u1", { role: "user", content: "Hi" }),
          row("a1", { content: "Half", status: "interrupted" }),
        ],
        { busy: true },
      );
      const turn = idleTurn();
      renderConversation("c1", turn);

      expect(
        screen.getByText("workspace:assistant.conversation.busyElsewhere"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "workspace:assistant.conversation.continue",
        }),
      ).toBeNull();
      // It refuses new messages until then.
      fireEvent.change(textbox(), { target: { value: "More?" } });
      fireEvent.keyDown(textbox(), { key: "Enter" });
      expect(turn.send).not.toHaveBeenCalled();
      // Refetched until the other tab's answer is done.
      vi.advanceTimersByTime(5000);
      expect(m.refetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
