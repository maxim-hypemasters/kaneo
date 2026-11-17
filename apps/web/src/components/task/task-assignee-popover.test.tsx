import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import SubtaskAssigneePopover from "./subtask-assignee-popover";
import TaskAssigneePopover from "./task-assignee-popover";

const mocks = vi.hoisted(() => ({
  awayLabels: vi.fn(
    () =>
      new Map([["user-2", "Away until Nov 20"]]) as ReadonlyMap<string, string>,
  ),
}));

const members = [
  { id: "user-1", name: "Ana" },
  { id: "user-2", name: "Ben" },
];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/time-off/away/use-away-labels", () => ({
  useAwayLabels: mocks.awayLabels,
}));
vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: members }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-members-of-projects", () => ({
  default: () => ({ data: members }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canAssignTasks: () => true }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const task = { id: "task-1", projectId: "project-1", userId: null } as Task;

describe.each([
  [
    "TaskAssigneePopover",
    (children: React.ReactNode) => (
      <TaskAssigneePopover task={task} workspaceId="workspace-1">
        {children}
      </TaskAssigneePopover>
    ),
  ],
  [
    "SubtaskAssigneePopover",
    (children: React.ReactNode) => (
      <SubtaskAssigneePopover tasks={[task]} workspaceId="workspace-1">
        {children}
      </SubtaskAssigneePopover>
    ),
  ],
])("%s", (_name, popover) => {
  it("looks up who is away only while the picker is open", async () => {
    render(popover(<button type="button">Assignee</button>));
    expect(mocks.awayLabels).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Assignee" }));

    expect(await screen.findByText("Away until Nov 20")).toBeTruthy();
    expect(mocks.awayLabels).toHaveBeenCalledWith("workspace-1", {
      enabled: true,
    });
  });
});
