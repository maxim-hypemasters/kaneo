import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type SubtaskRow from "../../subtask-row";
import { FeatureIssueGroups } from "./feature-issue-groups";
import { featureIssueTask } from "./feature-issue-task";

const mocks = vi.hoisted(() => ({ row: vi.fn() }));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusDisplayLabel: (_status: string, name: string) => name,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../subtask-row", () => ({
  default: (props: ComponentProps<typeof SubtaskRow>) => {
    mocks.row(props);
    return (
      <div>
        <button onClick={props.onNavigate}>
          {props.displayId} {props.task.title}
        </button>
        <button disabled={!props.canEdit} onClick={props.onToggleComplete}>
          Complete {props.task.title}
        </button>
      </div>
    );
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const base = {
  projectId: "project",
  projectSlug: "APP",
  number: 1,
  position: 0,
  priority: "low",
  userId: null,
  assignee: null,
  featureId: "feature",
  milestoneId: null,
  releaseId: null,
  releaseName: null,
  estimateSeconds: 3600,
  startDate: null,
  dueDate: null,
  archivedAt: null,
  columnId: null,
  createdAt: "2026-11-01T09:00:00Z",
  updatedAt: "2026-11-01T09:00:00Z",
  descriptionDeferred: true as const,
};
const bug = featureIssueTask({
  ...base,
  id: "bug",
  title: "Bug",
  type: "bug",
  status: "done",
});
const task = featureIssueTask({
  ...base,
  id: "task",
  title: "Task",
  type: "task",
  status: "to-do",
  archivedAt: "2026-11-02T09:00:00Z",
});
const groups = [
  {
    id: "todo",
    slug: "to-do",
    name: "To Do",
    position: 0,
    isFinal: false,
    total: 51,
  },
  {
    id: "done",
    slug: "done",
    name: "Done",
    position: 1,
    isFinal: true,
    total: 4,
  },
];

it("uses workflow order, server totals, real compact metadata and completed/read-only row controls", () => {
  const open = vi.fn();
  render(
    <FeatureIssueGroups
      groups={groups}
      tasks={[bug, task]}
      selected={new Map()}
      canEdit={false}
      projectId="project"
      workspaceId="workspace"
      onSelect={vi.fn()}
      onComplete={vi.fn()}
      onOpen={open}
      onDelete={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  expect(screen.getAllByRole("heading").map((row) => row.textContent)).toEqual([
    "To Do51",
    "Done4",
  ]);
  expect(mocks.row.mock.calls[0]![0]).toMatchObject({
    task: {
      id: "task",
      archivedAt: task.archivedAt,
      createdAt: base.createdAt,
      descriptionDeferred: true,
    },
    displayId: "APP-1",
    isCompleted: false,
    canEdit: false,
  });
  expect(mocks.row.mock.calls[1]![0]).toMatchObject({
    task: { type: "bug" },
    isCompleted: true,
  });
  expect((screen.getByText("Complete Bug") as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByText("APP-1 Bug"));
  expect(open).toHaveBeenCalledWith(bug);
});

it("retains selection targets across pagination for existing row controls", () => {
  const select = vi.fn();
  render(
    <FeatureIssueGroups
      groups={groups}
      tasks={[bug]}
      selected={
        new Map([
          [bug.id, bug],
          [task.id, task],
        ])
      }
      canEdit
      projectId="project"
      workspaceId="workspace"
      onSelect={select}
      onComplete={vi.fn()}
      onOpen={vi.fn()}
      onDelete={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  expect(mocks.row.mock.calls[0]![0].tasks).toEqual([bug, task]);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(select).toHaveBeenCalledWith(bug, false);
});
