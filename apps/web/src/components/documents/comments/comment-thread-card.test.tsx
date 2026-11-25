import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";
import { CommentThreadCard, type ThreadActions } from "./comment-thread-card";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}|${options.name}` : key,
  }),
}));
vi.mock("@/lib/format", () => ({
  formatRelativeTime: () => "2 hours ago",
  formatDateTime: () => "Nov 20, 2026, 10:00 AM",
}));
// The editors behind a comment need a real layout; their text is enough here.
vi.mock("./comment-body", () => ({
  CommentBody: ({ content }: { content: string }) => <p>{content}</p>,
}));
vi.mock("./comment-composer", () => ({
  CommentComposer: ({
    submitLabel,
    onSubmit,
  }: {
    submitLabel: string;
    onSubmit: (content: string) => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onSubmit("typed")}>
      {`compose:${submitLabel}`}
    </button>
  ),
}));

afterEach(cleanup);

const thread: DocumentCommentThread = {
  id: "thread",
  parentId: null,
  userId: "ana",
  userName: "Ana",
  userImage: null,
  content: "Too tight?",
  createdAt: "2026-11-20T10:00:00.000Z",
  editedAt: null,
  anchor: { quote: "ship by Friday", prefix: "We will", suffix: "if QA" },
  resolvedAt: null,
  resolvedBy: null,
  resolvedByName: null,
  replies: [
    {
      id: "reply",
      parentId: "thread",
      userId: "max",
      userName: "Max",
      userImage: null,
      content: "Moved to Monday",
      createdAt: "2026-11-20T11:00:00.000Z",
      editedAt: "2026-11-20T11:05:00.000Z",
    },
  ],
};

function setup(
  overrides: Partial<Parameters<typeof CommentThreadCard>[0]> = {},
) {
  const actions: ThreadActions = {
    reply: vi.fn().mockResolvedValue(undefined),
    edit: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
    resolve: vi.fn().mockResolvedValue(undefined),
  };
  const onShow = vi.fn();
  const onActivate = vi.fn();
  render(
    <ul>
      <CommentThreadCard
        thread={thread}
        active={false}
        detached={false}
        canComment
        currentUserId="max"
        members={[]}
        actions={actions}
        onActivate={onActivate}
        onShow={onShow}
        {...overrides}
      />
    </ul>,
  );
  return { actions, onShow, onActivate };
}

describe("CommentThreadCard", () => {
  it("shows the quoted text, the comment and its replies", () => {
    const { onShow, onActivate } = setup();
    expect(screen.getByText("Too tight?")).toBeTruthy();
    expect(screen.getByText("Moved to Monday")).toBeTruthy();
    expect(screen.getByText("common:documentComments.edited")).toBeTruthy();
    fireEvent.click(screen.getByText("ship by Friday"));
    expect(onActivate).toHaveBeenCalled();
    expect(onShow).toHaveBeenCalledOnce();
  });

  it("offers edit and delete only on the viewer's own comments", () => {
    setup();
    expect(
      screen.getByRole("button", {
        name: "common:documentComments.actions|Max",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "common:documentComments.actions|Ana",
      }),
    ).toBeNull();
  });

  it("replies and resolves", async () => {
    const { actions } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "common:documentComments.resolve" }),
    );
    expect(actions.resolve).toHaveBeenCalledWith("thread", true);
    fireEvent.click(
      screen.getByRole("button", { name: "common:documentComments.reply" }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "compose:common:documentComments.reply",
      }),
    );
    expect(actions.reply).toHaveBeenCalledWith("thread", "typed");
  });

  it("reopens a resolved thread and names who resolved it", () => {
    const { actions } = setup({
      thread: {
        ...thread,
        resolvedAt: "2026-11-21T10:00:00.000Z",
        resolvedBy: "ana",
        resolvedByName: "Ana",
      },
    });
    expect(
      screen.getByText("common:documentComments.resolvedBy|Ana"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "common:documentComments.reopen" }),
    );
    expect(actions.resolve).toHaveBeenCalledWith("thread", false);
  });

  it("gives a reader no way to change the thread", () => {
    setup({ canComment: false });
    expect(
      screen.queryByRole("button", { name: "common:documentComments.reply" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "common:documentComments.resolve",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "common:documentComments.actions|Max",
      }),
    ).toBeNull();
  });

  it("says when the commented text is gone and keeps the quote", () => {
    const { onShow } = setup({ detached: true });
    expect(screen.getByText("common:documentComments.detached")).toBeTruthy();
    fireEvent.click(screen.getByText("ship by Friday"));
    expect(onShow).not.toHaveBeenCalled();
  });
});
