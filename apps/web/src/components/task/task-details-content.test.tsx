import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import TaskDetailsContent from "./task-details-content";
const state = vi.hoisted(() => ({
  task: undefined as
    | undefined
    | { id: string; type: string; projectId: string },
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: state.task }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./features/feature-breadcrumb", () => ({
  FeatureBreadcrumb: () => null,
}));
vi.mock("./task-title", () => ({ default: () => null }));
vi.mock("./task-description", () => ({ default: () => <p>Description</p> }));
vi.mock("./task-related-content", () => ({ TaskRelatedContent: () => null }));
vi.mock("./task-activity", () => ({
  TaskActivity: () => <p>Legacy activity</p>,
}));
vi.mock("./features/workspace/feature-workspace", () => ({
  FeatureWorkspace: () => <p>Feature workspace</p>,
}));
vi.mock("./task-page-skeleton", () => ({
  TaskDetailsSkeleton: () => <p>Loading task</p>,
}));
afterEach(() => {
  cleanup();
  state.task = undefined;
});
it("waits for the entity type before mounting tab or legacy activity queries", () => {
  const { rerender } = render(
    <TaskDetailsContent taskId="f" projectId="p" workspaceId="w" />,
  );
  expect(screen.getByText("Loading task")).toBeInTheDocument();
  expect(screen.queryByText("Legacy activity")).not.toBeInTheDocument();
  state.task = { id: "f", type: "feature", projectId: "p" };
  rerender(<TaskDetailsContent taskId="f" projectId="p" workspaceId="w" />);
  expect(screen.getByText("Feature workspace")).toBeInTheDocument();
  expect(screen.queryByText("Legacy activity")).not.toBeInTheDocument();
});
it("retains the existing Task/Bug description and activity", () => {
  state.task = { id: "b", type: "bug", projectId: "p" };
  render(<TaskDetailsContent taskId="b" projectId="p" workspaceId="w" />);
  expect(screen.getByText("Description")).toBeInTheDocument();
  expect(screen.getByText("Legacy activity")).toBeInTheDocument();
});
