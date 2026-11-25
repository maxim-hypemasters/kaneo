import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { InboxDocumentComment } from "./inbox-document-comment";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params: { workspaceId: string; projectId: string };
    search?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      {...props}
      data-search={JSON.stringify(search)}
      href={to
        .replace("$workspaceId", params.workspaceId)
        .replace("$projectId", params.projectId)}
    >
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/shortcuts/use-shortcut", () => ({ useShortcut: vi.fn() }));

afterEach(cleanup);

const target = {
  workspaceId: "ws1",
  projectId: "p1",
  documentId: "doc1",
  featureId: null,
  commentId: "thread1",
  title: "Release plan",
  quote: "ship by Friday",
};

describe("InboxDocumentComment", () => {
  it("shows the document and the commented text, and links to the thread", () => {
    render(<InboxDocumentComment target={target} />);

    expect(screen.getByRole("heading", { name: "Release plan" })).toBeTruthy();
    expect(screen.getByText("ship by Friday")).toBeTruthy();
    const link = screen.getByRole("link", {
      name: "notifications:inbox.openDocument",
    });
    expect(link.getAttribute("href")).toBe(
      "/dashboard/workspace/ws1/project/p1",
    );
    expect(JSON.parse(link.getAttribute("data-search") ?? "{}")).toEqual({
      tab: "documents",
      documentId: "doc1",
      commentId: "thread1",
    });
  });

  it("opens a Feature document with its Feature", () => {
    render(
      <InboxDocumentComment
        target={{ ...target, featureId: "feature1", title: null, quote: null }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "tasks:projectHome.documents.untitled",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("notifications:inbox.commentedText")).toBeNull();
    expect(
      JSON.parse(screen.getByRole("link").getAttribute("data-search") ?? "{}"),
    ).toEqual({
      tab: "documents",
      documentId: "doc1",
      documentFeatureId: "feature1",
      commentId: "thread1",
    });
  });
});
