import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { TaskReleaseOriginProvider } from "@/components/task/task-release-origin-context";
import type { TaskReleaseOrigin } from "@/components/task/task-release-origin";
import TaskLayout from "./task-layout";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  task: { number: 1 } as Record<string, unknown>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    children: ReactNode;
  }) => (
    <a
      href={Object.entries(params).reduce(
        (path, [name, value]) => path.replace(`$${name}`, value),
        to,
      )}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/common/layout", () => {
  const Layout = ({ children }: { children: ReactNode }) => <>{children}</>;
  Layout.Header = Layout;
  Layout.Content = Layout;
  return { default: Layout };
});
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { name: "Project", slug: "PRJ" } }),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: mocks.task }),
}));
vi.mock("@/hooks/use-project-websocket", () => ({
  useProjectWebSocket: vi.fn(),
}));
vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => null }));
vi.mock("@/components/shortcuts/shortcut-keys", () => ({
  ShortcutKeys: () => null,
}));
vi.mock("@/components/task/milestones/milestone-details-sheet", () => ({
  MilestoneDetailsSheet: () => null,
}));
vi.mock("@/components/common/header/task-crumb-select", () => ({
  default: ({ onSelectTask }: { onSelectTask: (id: string) => void }) => (
    <button type="button" onClick={() => onSelectTask("next-feature")}>
      Switch task
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  mocks.navigate.mockClear();
  mocks.task = { number: 1 };
});
function renderLayout(origin: TaskReleaseOrigin | null = null) {
  render(
    <TaskReleaseOriginProvider origin={origin}>
      <TaskLayout taskId="current" projectId="project" workspaceId="workspace">
        <p>Content</p>
      </TaskLayout>
    </TaskReleaseOriginProvider>,
  );
}
function openLayout(origin: TaskReleaseOrigin | null) {
  renderLayout(origin);
  fireEvent.click(screen.getByRole("button", { name: "Switch task" }));
}
it("retains the validated originating release across same-project task/Feature navigation", () => {
  openLayout({ projectId: "project", releaseId: "origin-release" });
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
    params: {
      workspaceId: "workspace",
      projectId: "project",
      taskId: "next-feature",
    },
    search: { originReleaseId: "origin-release" },
  });
});
it.each([null, { projectId: "foreign-project", releaseId: "foreign-release" }])(
  "does not carry unrelated context into independent or foreign-project navigation",
  (origin) => {
    openLayout(origin);
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: {} }),
    );
  },
);
it("leads a feature back to the Features library instead of a task switcher", () => {
  mocks.task = { number: 12, type: "feature", title: "Billing" };
  renderLayout();

  expect(
    screen.getByRole("link", { name: "tasks:features.library.title" }),
  ).toHaveAttribute(
    "href",
    "/dashboard/workspace/workspace/project/project/features",
  );
  expect(screen.getByText("PRJ-12")).toHaveAttribute("aria-current", "page");
  expect(
    screen.queryByRole("button", { name: "Switch task" }),
  ).not.toBeInTheDocument();
});
it("names a feature without a number by its title", () => {
  mocks.task = { number: null, type: "feature", title: "Billing" };
  renderLayout();

  expect(screen.getByText("Billing")).toHaveAttribute("aria-current", "page");
});
it("keeps the task switcher for a task", () => {
  renderLayout();

  expect(
    screen.getByRole("button", { name: "Switch task" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "tasks:features.library.title" }),
  ).not.toBeInTheDocument();
});
