import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AssistantChatCard } from "./assistant-chat-card";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@/lib/format", () => ({
  formatDateTime: () => "",
  formatRelativeTime: () => "now",
}));
vi.mock("@/hooks/use-assistant-turn", () => ({
  useAssistantTurn: () => ({ isActive: false }),
}));
vi.mock("@/hooks/mutations/assistant/use-delete-assistant-chat", () => ({
  useDeleteAssistantChat: () => ({ mutate: vi.fn() }),
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
vi.mock("../conversation/assistant-conversation", () => ({
  AssistantConversation: ({
    composerRef,
  }: {
    composerRef: RefObject<HTMLTextAreaElement | null>;
  }) => <textarea aria-label="composer" ref={composerRef} />,
}));

afterEach(cleanup);

function renderCard(chatId: string | null) {
  const onSelectChat = vi.fn();
  render(
    <AssistantChatCard
      workspaceId="ws1"
      workspaceSlug="acme"
      chatId={chatId}
      model="anthropic/claude-sonnet-5.5"
      warning={null}
      canManage={false}
      onSelectChat={onSelectChat}
    />,
  );
  return {
    onSelectChat,
    chatsButton: screen.getByRole("button", {
      name: "workspace:assistant.chats",
    }),
  };
}

const row = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title}`) });

describe("AssistantChatCard", () => {
  it("toggles the history pane with its state and target announced", () => {
    const { chatsButton } = renderCard("c2");
    const history = screen.getByRole("navigation", {
      name: "workspace:assistant.history.label",
    });
    expect(chatsButton).toHaveAttribute("aria-expanded", "false");
    expect(chatsButton).toHaveAttribute("aria-controls", history.id);

    fireEvent.click(chatsButton);
    expect(chatsButton).toHaveAttribute("aria-expanded", "true");
    // The open chat's row takes focus.
    expect(row("Chat c2")).toHaveFocus();

    fireEvent.click(
      screen.getByRole("button", { name: "workspace:assistant.backToChat" }),
    );
    expect(chatsButton).toHaveAttribute("aria-expanded", "false");
    expect(chatsButton).toHaveFocus();
  });

  it("focuses the history heading when no listed chat is open", () => {
    const { chatsButton } = renderCard(null);
    fireEvent.click(chatsButton);
    expect(
      screen.getByRole("heading", { name: "workspace:assistant.chats" }),
    ).toHaveFocus();
  });

  it("returns to the composer after picking a chat", () => {
    const { chatsButton, onSelectChat } = renderCard("c2");
    fireEvent.click(chatsButton);
    fireEvent.click(row("Chat c1"));

    expect(onSelectChat).toHaveBeenCalledWith("c1");
    expect(chatsButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("textbox", { name: "composer" })).toHaveFocus();
  });
});
