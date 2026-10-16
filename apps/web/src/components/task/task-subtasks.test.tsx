import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  type FeatureIndex,
  getFeatureIndex,
} from "@/lib/features/feature-index";
import type Task from "@/types/task";
import type SubtaskRow from "./subtask-row";
import TaskSubtasks from "./task-subtasks";

const mocks = vi.hoisted(() => ({
  canCreateTasks: vi.fn(),
  canUpdateTasks: vi.fn(),
  createTask: vi.fn(),
  createPending: false,
  updateFeature: vi.fn(),
  getColumns: vi.fn(),
  getRelations: vi.fn(),
  featureIndex: undefined as unknown as FeatureIndex,
  fetchColumns: vi.fn(),
  updateStatus: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: unknown }) => children,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/mutations/task/use-create-task", () => ({
  default: () => ({
    mutateAsync: mocks.createTask,
    isPending: mocks.createPending,
  }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({ mutateAsync: mocks.updateFeature }),
}));
vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-status", () => ({
  useUpdateTaskStatus: () => ({ mutateAsync: mocks.updateStatus }),
}));
vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => mocks.getColumns(),
}));
vi.mock("@/hooks/queries/task/use-feature-index", () => ({
  useFeatureIndex: () => mocks.featureIndex,
}));
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => mocks.getRelations(),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace-1" } }),
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({ data: { members: [] } }),
  }),
);
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [{ id: "project-1", slug: "WEB" }] }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: mocks.canCreateTasks,
    canUpdateTasks: mocks.canUpdateTasks,
  }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));
vi.mock("@/fetchers/column/get-columns", () => ({
  default: (projectId: string) => mocks.fetchColumns(projectId),
}));
vi.mock("./subtask-row", () => ({
  default: ({
    task,
    displayId,
    isCompleted,
    onToggleComplete,
    onNavigate,
    onRemoveFromFeature,
  }: ComponentProps<typeof SubtaskRow>) => (
    <div data-testid="feature-task">
      <span>{displayId}</span>
      <button
        type="button"
        aria-label={`Toggle ${task.title}`}
        aria-pressed={isCompleted}
        onClick={onToggleComplete}
      >
        Toggle
      </button>
      <button type="button" onClick={onNavigate}>
        Open {task.title}
      </button>
      <button type="button" onClick={onRemoveFromFeature}>
        Remove {task.title}
      </button>
    </div>
  ),
}));

const boardTask = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    status: "to-do",
    projectId: "project-1",
    type: "task",
    featureId: "feature-1",
    userId: null,
    assigneeName: null,
    ...values,
  }) as Task;

const relatedTask = (id: string, isCompleted: boolean) => ({
  id,
  projectId: "project-1",
  title: id,
  status: isCompleted ? "done" : "to-do",
  isCompleted,
  priority: null,
  number: 4,
  userId: null,
  assigneeName: null,
});

function renderSection(featureStatus = "to-do") {
  return render(
    <TaskSubtasks
      featureId="feature-1"
      projectId="project-1"
      workspaceId="workspace-1"
      featureStatus={featureStatus}
    />,
  );
}

function addTask(title: string) {
  fireEvent.click(
    screen.getByRole("button", {
      name: "tasks:subtasks.addAction tasks:subtasks.title",
    }),
  );
  fireEvent.change(
    screen.getByPlaceholderText("tasks:subtasks.inputPlaceholder"),
    { target: { value: title } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:subtasks.addAction" }),
  );
}

beforeEach(() => {
  mocks.featureIndex = getFeatureIndex(undefined);
  mocks.getRelations.mockReturnValue({ data: [], isSuccess: true });
  mocks.canCreateTasks.mockReturnValue(true);
  mocks.canUpdateTasks.mockReturnValue(true);
  mocks.getColumns.mockReturnValue({
    data: [
      { id: "todo", slug: "to-do", name: "To Do", isFinal: false },
      { id: "done", slug: "done", name: "Done", isFinal: true },
    ],
    isLoading: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskSubtasks", () => {
  it("creates the task inside the feature in one request", async () => {
    mocks.createTask.mockResolvedValue({ id: "task-1" });
    renderSection("planned");

    addTask("Design login form");

    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledTimes(1));
    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Design login form",
        projectId: "project-1",
        status: "planned",
        featureId: "feature-1",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText("tasks:subtasks.inputPlaceholder"),
      ).not.toBeInTheDocument(),
    );
  });

  it("uses the project's first active column for an active feature", async () => {
    mocks.createTask.mockResolvedValue({ id: "task-2" });
    renderSection("in-progress");

    addTask("Implement login form");

    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledTimes(1));
    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ status: "to-do", featureId: "feature-1" }),
    );
  });

  it("keeps the title and reports a failed create", async () => {
    mocks.createTask.mockRejectedValue(new Error("Nope"));
    renderSection();

    addTask("Write tests");

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "tasks:subtasks.createError",
      ),
    );
    expect(
      screen.getByPlaceholderText("tasks:subtasks.inputPlaceholder"),
    ).toHaveValue("Write tests");
  });

  it("blocks creation for an active feature until columns are available", () => {
    mocks.getColumns.mockReturnValue({ data: [], isLoading: true });
    renderSection("in-progress");

    expect(
      screen.getByRole("button", {
        name: "tasks:subtasks.addAction tasks:subtasks.title",
      }),
    ).toBeDisabled();
  });

  it("hides task creation without task-create permission", () => {
    mocks.canCreateTasks.mockReturnValue(false);
    renderSection("planned");

    expect(
      screen.queryByRole("button", {
        name: "tasks:subtasks.addAction tasks:subtasks.title",
      }),
    ).not.toBeInTheDocument();
  });

  it("says when the feature has no tasks", () => {
    renderSection();

    expect(screen.getByText("tasks:subtasks.empty")).toBeInTheDocument();
  });
});

describe("feature tasks from the board", () => {
  beforeEach(() => {
    mocks.featureIndex = getFeatureIndex({
      columns: [
        {
          tasks: [
            boardTask("feature-1", { type: "feature", featureId: null }),
            boardTask("Cart", { number: 2 }),
            boardTask("Pay", { number: 3, status: "done" }),
            boardTask("Elsewhere", { featureId: "feature-2" }),
          ],
        },
      ],
    });
    // The board wins over the relations once it holds the feature.
    mocks.getRelations.mockReturnValue({ data: [], isSuccess: false });
  });

  it("lists the feature's tasks with progress from final columns", () => {
    renderSection();

    expect(screen.getAllByTestId("feature-task")).toHaveLength(2);
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("WEB-2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Pay" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("takes a task out of the feature", async () => {
    mocks.updateFeature.mockResolvedValue({});
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Remove Cart" }));

    await waitFor(() =>
      expect(mocks.updateFeature).toHaveBeenCalledWith({
        task: { id: "Cart", projectId: "project-1", featureId: "feature-1" },
        featureId: null,
      }),
    );
  });

  it("reports a failed removal", async () => {
    mocks.updateFeature.mockRejectedValue(new Error("Conflict"));
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Remove Cart" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Conflict"),
    );
  });

  it("leaves Enter to a focused row control, and opens the row moved to", () => {
    renderSection();
    const remove = screen.getByRole("button", { name: "Remove Pay" });

    // Moving through the rows takes focus off the control.
    remove.focus();
    fireEvent.keyDown(remove, { key: "ArrowDown" });
    expect(remove).not.toHaveFocus();

    remove.focus();
    fireEvent.keyDown(remove, { key: "Enter" });
    fireEvent.keyDown(remove, { key: " " });
    expect(mocks.navigate).not.toHaveBeenCalled();

    remove.blur();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate.mock.calls[0]?.[0].params).toMatchObject({
      taskId: "Cart",
    });
  });
});

describe("while a task is being created", () => {
  afterEach(() => {
    mocks.createPending = false;
  });

  it("doesn't send the title again on Enter", () => {
    mocks.createPending = true;
    renderSection();

    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:subtasks.addAction tasks:subtasks.title",
      }),
    );
    const input = screen.getByPlaceholderText(
      "tasks:subtasks.inputPlaceholder",
    );
    fireEvent.change(input, { target: { value: "Design login form" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});

describe("feature tasks without a cached board", () => {
  function renderFromRelations(isCompleted: boolean) {
    mocks.getRelations.mockReturnValue({
      isSuccess: true,
      data: [
        {
          id: "feature:child:feature-1",
          relationType: "subtask",
          sourceTaskId: "feature-1",
          targetTaskId: "child",
          sourceTask: relatedTask("feature-1", false),
          targetTask: relatedTask("child", isCompleted),
        },
        {
          id: "related",
          relationType: "related",
          sourceTaskId: "feature-1",
          targetTaskId: "linked",
          sourceTask: relatedTask("feature-1", false),
          targetTask: relatedTask("linked", false),
        },
      ],
    });
    return renderSection();
  }

  it.each([true, false])(
    "lists the feature's tasks from its relations (completed=%s)",
    (completed) => {
      renderFromRelations(completed);
      expect(screen.getAllByTestId("feature-task")).toHaveLength(1);
      expect(screen.getByText(completed ? "1/1" : "0/1")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Toggle child" }),
      ).toHaveAttribute("aria-pressed", String(completed));
    },
  );

  it.each([true, false])(
    "toggles completion=%s using the project's columns",
    async (completed) => {
      mocks.fetchColumns.mockResolvedValue([
        { slug: "to-do", isFinal: false },
        { slug: "done", isFinal: true },
      ]);
      renderFromRelations(completed);
      fireEvent.click(screen.getByRole("button", { name: "Toggle child" }));
      await waitFor(() =>
        expect(mocks.updateStatus).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "child",
            status: completed ? "to-do" : "done",
          }),
        ),
      );
      expect(mocks.fetchColumns).toHaveBeenCalledWith("project-1");
    },
  );

  it("does not invent a status when the workflow has no final column", async () => {
    mocks.fetchColumns.mockResolvedValue([{ slug: "to-do", isFinal: false }]);
    renderFromRelations(false);
    fireEvent.click(screen.getByRole("button", { name: "Toggle child" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "tasks:subtasks.noCompletionColumn",
      ),
    );
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it("opens a task in its own project", () => {
    renderFromRelations(true);
    fireEvent.click(screen.getByRole("button", { name: "Open child" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          workspaceId: "workspace-1",
          projectId: "project-1",
          taskId: "child",
        },
      }),
    );
  });
});
