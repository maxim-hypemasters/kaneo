import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import TaskCardContextMenuContent from "./task-card-context-menu-content";

const duplicateTask = vi.fn();
const canCreateTasks = vi.fn(() => true);
const { updateTaskType, updateTaskFeature, toastError } = vi.hoisted(() => ({
  updateTaskType: vi.fn(),
  updateTaskFeature: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/hooks/mutations/task/use-duplicate-task", () => ({
  useDuplicateTask: () => ({ mutate: duplicateTask }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-type", () => ({
  useUpdateTaskType: () => ({ mutateAsync: updateTaskType }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({ mutateAsync: updateTaskFeature }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

afterEach(() => {
  canCreateTasks.mockReturnValue(true);
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }): React.JSX.Element => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  ContextMenuSeparator: (): React.JSX.Element => <div />,
  ContextMenuSub: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuSubContent: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuSubTrigger: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuCheckboxItem: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
}));

vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({
    data: [],
  }),
}));

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({
      data: { members: [] },
    }),
  }),
);

vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: [] }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ getQueryData: () => [] }),
}));

vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-description", () => ({
  useUpdateTaskDescription: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-due-date", () => ({
  useUpdateTaskDueDate: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-status", () => ({
  useUpdateTaskStatus: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-status-priority", () => ({
  useUpdateTaskPriority: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-title", () => ({
  useUpdateTaskTitle: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks,
    canUpdateTasks: () => true,
    canDeleteTasks: () => true,
    canAssignTasks: () => true,
  }),
}));

vi.mock("@/store/project", () => ({
  default: () => ({
    project: {
      columns: [],
    },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) =>
      options?.title ? `${key}|${options.title}` : key,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const task = {
  id: "task-1",
  title: "Test task",
  number: 1,
  description: null,
  status: "to-do",
  priority: null,
  startDate: null,
  dueDate: null,
  position: 1,
  createdAt: "2026-08-05T00:00:00.000Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  projectId: "project-1",
} as const satisfies Task;

const taskCardContext = {
  projectId: "project-1",
  worskpaceId: "workspace-1",
};

function renderTask(taskToRender: Task) {
  render(
    <TaskCardContextMenuContent
      task={taskToRender}
      taskCardContext={taskCardContext}
      onDeleteClick={vi.fn()}
    />,
  );
}

describe("TaskCardContextMenuContent", () => {
  it("hides Mark as planned for planned tasks", () => {
    renderTask({
      ...task,
      status: "planned",
    });

    expect(
      screen.queryByText("tasks:actions.markAsPlanned"),
    ).not.toBeInTheDocument();
  });

  it("shows Mark as planned for tasks that are not planned", () => {
    renderTask(task);

    expect(screen.getByText("tasks:actions.markAsPlanned")).toBeInTheDocument();
  });
});

it("duplicates using the localized title suffix", () => {
  renderTask(task);
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:actions.duplicate" }),
  );
  expect(duplicateTask).toHaveBeenCalledWith({
    taskId: task.id,
    title: `tasks:duplicate.titleSuffix|${task.title}`,
  });
});
it("hides duplication without task-create permission", () => {
  canCreateTasks.mockReturnValue(false);
  renderTask(task);
  expect(screen.queryByText("tasks:actions.duplicate")).toBeNull();
});

describe("feature actions", () => {
  it("converts a task into a feature", () => {
    renderTask(task);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:features.convertToFeature" }),
    );
    expect(updateTaskType).toHaveBeenCalledWith({ task, type: "feature" });
    expect(screen.queryByText("tasks:features.convertToTask")).toBeNull();
    expect(screen.queryByText("tasks:features.remove")).toBeNull();
  });

  it("converts an empty feature into a task", () => {
    const feature = {
      ...task,
      type: "feature" as const,
      subtaskCounts: { completed: 0, total: 0 },
    };
    renderTask(feature);
    const convert = screen.getByRole("button", {
      name: "tasks:features.convertToTask",
    });
    expect(convert).toBeEnabled();
    fireEvent.click(convert);
    expect(updateTaskType).toHaveBeenCalledWith({
      task: feature,
      type: "task",
    });
  });

  it("explains why a feature with tasks can't become a task", () => {
    renderTask({
      ...task,
      type: "feature",
      subtaskCounts: { completed: 1, total: 3 },
    });
    const convert = screen.getByRole("button", {
      name: /tasks:features.convertToTask/,
    });
    expect(convert).toBeDisabled();
    expect(convert).toHaveTextContent("tasks:features.convertBlocked");
  });

  it("takes a task out of its feature", () => {
    const member = { ...task, featureId: "feature-1" };
    renderTask(member);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:features.remove" }),
    );
    expect(updateTaskFeature).toHaveBeenCalledWith({
      task: member,
      featureId: null,
    });
  });

  it("reports a failed conversion", async () => {
    updateTaskType.mockRejectedValueOnce(new Error("409"));
    renderTask(task);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:features.convertToFeature" }),
    );
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("tasks:features.typeError"),
    );
  });
});
