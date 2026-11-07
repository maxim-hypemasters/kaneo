import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { TaskReleaseOriginProvider } from "@/components/task/task-release-origin-context";
import type { TaskReleaseOrigin } from "@/components/task/task-release-origin";
import TaskLayout from "./task-layout";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
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
  default: () => ({ data: { number: 1 } }),
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
});
function openLayout(origin: TaskReleaseOrigin | null) {
  render(
    <TaskReleaseOriginProvider origin={origin}>
      <TaskLayout taskId="current" projectId="project" workspaceId="workspace">
        <p>Content</p>
      </TaskLayout>
    </TaskReleaseOriginProvider>,
  );
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
