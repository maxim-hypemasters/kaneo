import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { getFeatureIndex } from "@/lib/features/feature-index";
import type Task from "@/types/task";
import { useRelationPickerStore } from "./task-relation-picker-store";
import TaskRelations from "./task-relations";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updateFeature: vi.fn(),
  createRelation: vi.fn(),
  deleteRelation: vi.fn(),
  toastError: vi.fn(),
  canUpdateTasks: vi.fn(),
  relations: [] as unknown[],
  board: undefined as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({ mutateAsync: mocks.updateFeature }),
}));
vi.mock("@/hooks/mutations/task-relation/use-create-task-relation", () => ({
  default: () => ({ mutateAsync: mocks.createRelation }),
}));
vi.mock("@/hooks/mutations/task-relation/use-delete-task-relation", () => ({
  default: () => ({ mutate: mocks.deleteRelation }),
}));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { slug: "WEB" } }),
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [{ id: "project-1", slug: "WEB" }] }),
}));
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({ data: mocks.board }),
}));
vi.mock("@/hooks/queries/task/use-feature-index", () => ({
  useFeatureIndex: () =>
    getFeatureIndex(mocks.board as Parameters<typeof getFeatureIndex>[0]),
}));
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => ({ data: mocks.relations, isSuccess: true }),
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
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: mocks.canUpdateTasks }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));
vi.mock("./subtask-status-popover", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./sections/reference-assignee-button", () => ({
  ReferenceAssigneeButton: () => null,
}));

const boardTask = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    status: "to-do",
    projectId: "project-1",
    type: "task",
    featureId: null,
    userId: null,
    ...values,
  }) as Task;

const summary = (id: string) => ({
  id,
  title: id,
  status: "to-do",
  isCompleted: false,
  priority: null,
  number: 2,
  projectId: "project-1",
  userId: null,
  assigneeName: null,
});

const openTask: Pick<Task, "id" | "projectId" | "featureId" | "type"> = {
  id: "Cart",
  projectId: "project-1",
  featureId: "Checkout",
  type: "task",
};

function renderRelations(task = openTask) {
  return render(
    <TaskRelations
      taskId="Cart"
      projectId="project-1"
      workspaceId="workspace-1"
      task={task}
    />,
  );
}

function requestPicker(mode: "feature" | "related") {
  act(() => {
    useRelationPickerStore.getState().open("Cart", mode);
  });
}

beforeEach(() => {
  mocks.canUpdateTasks.mockReturnValue(true);
  mocks.updateFeature.mockResolvedValue({});
  mocks.createRelation.mockResolvedValue({});
  mocks.board = {
    columns: [
      {
        id: "to-do",
        tasks: [
          boardTask("Checkout", { type: "feature", number: 3 }),
          boardTask("Search", { type: "feature", number: 4 }),
          boardTask("Cart", { featureId: "Checkout" }),
          boardTask("Login"),
        ],
      },
    ],
  };
  mocks.relations = [
    {
      id: "feature:Cart:Checkout",
      relationType: "subtask",
      sourceTaskId: "Checkout",
      targetTaskId: "Cart",
      sourceTask: summary("Checkout"),
      targetTask: summary("Cart"),
    },
    {
      id: "relation-1",
      relationType: "related",
      sourceTaskId: "Cart",
      targetTaskId: "Login",
      sourceTask: summary("Cart"),
      targetTask: summary("Login"),
    },
  ];
});

afterEach(() => {
  cleanup();
  useRelationPickerStore.getState().clear();
  vi.clearAllMocks();
});

describe("TaskRelations", () => {
  it("lists linked tasks, leaving feature membership to the feature", () => {
    renderRelations();

    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Checkout" }),
    ).not.toBeInTheDocument();
  });

  it("offers the project's other features and sets one in a single request", async () => {
    renderRelations();
    requestPicker("feature");

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("Search"),
    ]);
    expect(
      screen.queryByText("tasks:relations.selectTask"),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(options[0]);
    });

    await waitFor(() =>
      expect(mocks.updateFeature).toHaveBeenCalledWith({
        task: openTask,
        featureId: "Search",
      }),
    );
    expect(mocks.updateFeature).toHaveBeenCalledTimes(1);
    expect(mocks.createRelation).not.toHaveBeenCalled();
    expect(mocks.deleteRelation).not.toHaveBeenCalled();
  });

  it("reports a rejected feature change", async () => {
    mocks.updateFeature.mockRejectedValue(new Error("Conflict"));
    renderRelations();
    requestPicker("feature");

    const [option] = await screen.findAllByRole("option");
    await act(async () => {
      fireEvent.click(option);
    });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Conflict"),
    );
  });

  it("says it's loading, not that there are no features, before the board arrives", async () => {
    mocks.board = undefined;
    renderRelations();
    requestPicker("feature");

    expect(await screen.findByText("common:empty.loading")).toBeInTheDocument();
    expect(screen.queryByText("tasks:features.empty")).not.toBeInTheDocument();
  });

  it("doesn't pick a feature for a feature", () => {
    renderRelations({ ...openTask, featureId: null, type: "feature" });
    requestPicker("feature");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(useRelationPickerStore.getState().request).toBeNull();
  });

  it("links related tasks through the relations route", async () => {
    renderRelations();
    requestPicker("related");

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("Checkout"),
      expect.stringContaining("Search"),
    ]);
    expect(screen.getByText("tasks:relations.selectTask")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(options[1]);
    });

    expect(mocks.createRelation).toHaveBeenCalledWith({
      sourceTaskId: "Cart",
      targetTaskId: "Search",
      relationType: "related",
    });
    expect(mocks.updateFeature).not.toHaveBeenCalled();
  });
});
