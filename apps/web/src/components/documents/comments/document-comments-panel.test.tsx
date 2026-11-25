import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";
import { DocumentCommentsPanel } from "./document-comments-panel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./comment-thread-card", () => ({
  CommentThreadCard: ({
    thread,
    active,
    detached,
  }: {
    thread: DocumentCommentThread;
    active: boolean;
    detached: boolean;
  }) => (
    <li data-active={active} data-detached={detached}>
      {thread.id}
    </li>
  ),
}));

afterEach(cleanup);

const thread = (id: string) => ({ id }) as DocumentCommentThread;

function setup(
  overrides: Partial<Parameters<typeof DocumentCommentsPanel>[0]> = {},
) {
  const props = {
    id: "panel",
    docked: true,
    status: "ready" as const,
    threads: [thread("a"), thread("b")],
    filter: "open" as const,
    activeId: "b",
    detachedIds: new Set(["a"]),
    canComment: true,
    currentUserId: "max",
    members: [],
    actions: {
      reply: vi.fn(),
      edit: vi.fn(),
      remove: vi.fn(),
      resolve: vi.fn(),
    },
    onFilterChange: vi.fn(),
    onActivate: vi.fn(),
    onShow: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<DocumentCommentsPanel {...props} />);
  return props;
}

describe("DocumentCommentsPanel", () => {
  it("lists the threads and marks the active and the detached one", () => {
    setup();
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["a", "b"]);
    expect(items[0].dataset.detached).toBe("true");
    expect(items[1].dataset.active).toBe("true");
  });

  it("switches between open and resolved threads", () => {
    const props = setup();
    const open = screen.getByRole("button", {
      name: "common:documentComments.filterOpen",
    });
    expect(open.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(
      screen.getByRole("button", {
        name: "common:documentComments.filterResolved",
      }),
    );
    expect(props.onFilterChange).toHaveBeenCalledWith("resolved");
  });

  it("explains how to comment when there are no open threads", () => {
    setup({ threads: [] });
    expect(screen.getByText("common:documentComments.emptyOpen")).toBeTruthy();
    expect(
      screen.getByText("common:documentComments.emptyOpenHint"),
    ).toBeTruthy();
  });

  it("gives a reader no hint to comment, and says when nothing is resolved", () => {
    setup({ threads: [], canComment: false });
    expect(
      screen.queryByText("common:documentComments.emptyOpenHint"),
    ).toBeNull();
    cleanup();
    setup({ threads: [], filter: "resolved" });
    expect(
      screen.getByText("common:documentComments.emptyResolved"),
    ).toBeTruthy();
  });

  it("shows the comment being written instead of the empty state", () => {
    setup({ threads: [], draft: <p>writing</p> });
    expect(screen.getByText("writing")).toBeTruthy();
    expect(screen.queryByText("common:documentComments.emptyOpen")).toBeNull();
  });

  it("offers to try again when the threads could not be loaded", () => {
    const props = setup({ status: "error", threads: [] });
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it("closes on Escape without letting the key reach the document", () => {
    const props = setup();
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    fireEvent.keyDown(
      screen.getByRole("complementary", {
        name: "common:documentComments.title",
      }),
      { key: "Escape" },
    );
    window.removeEventListener("keydown", outer);
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });
});
