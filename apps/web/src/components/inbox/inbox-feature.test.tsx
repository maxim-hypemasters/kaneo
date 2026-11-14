import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { shortcutRegistry } from "@/lib/shortcuts/registry";
import { ShortcutTestWrapper } from "@/lib/shortcuts/shortcut-test-wrapper";
import { InboxFeature } from "./inbox-feature";

const m = vi.hoisted(() => ({
  feature: vi.fn(),
  activity: vi.fn(),
  navigate: vi.fn(),
  canUpdate: true,
}));
beforeEach(() => {
  m.canUpdate = true;
  m.feature.mockReturnValue({
    data: {
      id: "feature",
      type: "feature",
      title: "Checkout",
      number: 12,
      status: null,
      priority: null,
      archivedAt: "2026-10-01T10:00:00.000Z",
      projectId: "project",
      workspaceId: "workspace",
    },
  });
  m.activity.mockReturnValue({
    data: [{ id: "a1", type: "created", content: null }],
  });
});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => m.navigate,
  Link: ({
    params,
    search,
    children,
    ...props
  }: {
    params: { workspaceId: string; projectId: string; taskId: string };
    search?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      {...props}
      data-search={JSON.stringify(search)}
      href={`/dashboard/workspace/${params.workspaceId}/project/${params.projectId}/task/${params.taskId}`}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({ default: m.feature }));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { name: "Web", slug: "WEB" } }),
}));
vi.mock("@/hooks/queries/activity/use-get-activities-by-task-id", () => ({
  default: m.activity,
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateFeatures: () => m.canUpdate }),
}));
vi.mock("@/components/activity", () => ({
  default: ({ subject }: { subject?: string }) => (
    <div data-testid="activity" data-subject={subject} />
  ),
}));
vi.mock(
  "@/components/task/features/workspace/feature-comment-composer",
  () => ({
    FeatureCommentComposer: ({ featureId }: { featureId: string }) => (
      <div data-testid="composer">{featureId}</div>
    ),
  }),
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

afterEach(cleanup);
describe("Inbox Feature preview", () => {
  it("shows where the Feature lives instead of task workflow fields", () => {
    render(<InboxFeature featureId="feature" />);

    const heading = screen.getByRole("heading", { name: /Checkout/ });
    expect(heading.querySelector("svg")).toHaveAttribute(
      "aria-label",
      "tasks:features.typeFeature",
    );
    expect(screen.getByText("Web")).toBeInTheDocument();
    expect(screen.getByText("WEB-12")).toBeInTheDocument();
    expect(
      screen.getByText("tasks:features.library.archived"),
    ).toBeInTheDocument();
    expect(screen.queryByText("tasks:status.label")).not.toBeInTheDocument();
    expect(screen.queryByText("tasks:priority.label")).not.toBeInTheDocument();
    const open = screen.getByRole("link", {
      name: "notifications:inbox.openFeature",
    });
    expect(open).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace/project/project/task/feature",
    );
    expect(screen.getByTestId("activity")).toHaveAttribute(
      "data-subject",
      "feature",
    );
    expect(m.activity).toHaveBeenCalledWith("feature", true, 6);
  });

  it("opens the Feature with Enter", () => {
    render(
      <ShortcutTestWrapper>
        <InboxFeature featureId="feature" />
      </ShortcutTestWrapper>,
    );

    fireEvent.keyDown(document.body, { key: "Enter", code: "Enter" });

    expect(m.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: {
        workspaceId: "workspace",
        projectId: "project",
        taskId: "feature",
      },
      search: {},
    });
    shortcutRegistry.reset();
  });

  it("offers the Feature comment composer only to people who can comment", () => {
    const view = render(<InboxFeature featureId="feature" />);
    expect(screen.getByTestId("composer")).toHaveTextContent("feature");

    m.canUpdate = false;
    view.rerender(<InboxFeature featureId="feature" />);
    expect(screen.queryByTestId("composer")).not.toBeInTheDocument();
  });

  it("reports a deleted or hidden Feature without a retry", () => {
    m.feature.mockReturnValue({
      isError: true,
      error: new HttpError(404, "Not found"),
    });
    render(<InboxFeature featureId="feature" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "notifications:inbox.featureUnavailable",
    );
    expect(screen.queryByText("common:error.tryAgain")).not.toBeInTheDocument();
  });

  it("offers a retry when the Feature couldn't be loaded", () => {
    const refetch = vi.fn();
    m.feature.mockReturnValue({
      isError: true,
      error: new Error("Network unavailable"),
      refetch,
    });
    render(<InboxFeature featureId="feature" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "notifications:inbox.featureLoadError",
    );
    fireEvent.click(screen.getByText("common:error.tryAgain"));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
