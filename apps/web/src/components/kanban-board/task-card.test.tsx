import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import TaskCard from "./task-card";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en-US" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("@/store/project", () => ({
  default: () => ({
    project: {
      id: "project",
      slug: "PROJ",
      columns: [
        { id: "shared", slug: "shared", isFinal: true },
        { id: "shared", slug: "shared", isFinal: false },
      ],
    },
  }),
}));
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => ({
    showLabels: true,
    showPriority: true,
    showDueDates: true,
    showTaskNumbers: true,
    showAssignees: true,
  }),
}));
vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({}),
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({ useGetActiveWorkspaceUsers: () => ({}) }),
);
vi.mock(
  "@/hooks/queries/custom-field/use-get-custom-field-values-by-project",
  () => ({ default: () => ({ data: [] }) }),
);
vi.mock("@/components/task/task-progress-badges", () => ({
  TaskProgressBadges: () => null,
}));
vi.mock("@/components/task/task-pull-requests", () => ({
  TaskPullRequests: () => null,
}));
vi.mock("./task-card-context-menu/task-card-context-menu-content", () => ({
  default: () => null,
}));

afterEach(cleanup);

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

it("keeps details in the rendered open column despite a final column sharing its slug", () => {
  const task: Task = {
    id: "task",
    title: "Open work",
    status: "shared",
    projectId: "project",
    number: 1,
    description: null,
    priority: "high",
    startDate: null,
    dueDate: "2030-01-01T00:00:00Z",
    position: 1,
    createdAt: "2026-10-01T00:00:00Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    labels: [{ id: "label", name: "Regression label", color: "red" }],
  };
  const view = render(<TaskCard task={task} isFinalColumn={false} />, {
    wrapper,
  });
  expect(screen.getByText("Regression label")).toBeVisible();
  view.rerender(<TaskCard task={task} isFinalColumn />);
  expect(screen.queryByText("Regression label")).not.toBeInTheDocument();
  expect(screen.getByText("Open work")).toBeVisible();
});

const baseTask: Task = {
  id: "cart",
  title: "Cart page",
  status: "shared",
  projectId: "project",
  number: 2,
  description: null,
  priority: null,
  startDate: null,
  dueDate: null,
  position: 2,
  createdAt: "2026-10-01T00:00:00Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  type: "task",
  featureId: null,
  subtaskCounts: { completed: 0, total: 0 },
};

it("marks a feature card and shows its tasks' progress", () => {
  render(
    <TaskCard
      task={{
        ...baseTask,
        id: "checkout",
        title: "Checkout",
        type: "feature",
        subtaskCounts: { completed: 1, total: 3 },
      }}
      isFinalColumn={false}
    />,
    { wrapper },
  );
  expect(screen.getByText("tasks:features.badge")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "tasks:subtasks.progress" }),
  ).toHaveTextContent("1/3");
});

it("names a task's feature from the cached board", () => {
  queryClient.setQueryData(["tasks", "project"], {
    id: "project",
    columns: [
      {
        id: "shared",
        slug: "shared",
        tasks: [
          { ...baseTask, id: "checkout", title: "Checkout", type: "feature" },
        ],
      },
    ],
    plannedTasks: [],
    archivedTasks: [],
  });
  render(
    <TaskCard
      task={{ ...baseTask, featureId: "checkout" }}
      isFinalColumn={false}
    />,
    { wrapper },
  );
  expect(
    screen.getByRole("button", { name: "tasks:features.chipLabel" }),
  ).toHaveTextContent("Checkout");
  expect(screen.queryByText("tasks:features.badge")).not.toBeInTheDocument();
  queryClient.clear();
});

it("adds nothing to a plain task", () => {
  render(<TaskCard task={baseTask} isFinalColumn={false} />, { wrapper });
  expect(screen.queryByText("tasks:features.badge")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /tasks:features|tasks:subtasks/ }),
  ).not.toBeInTheDocument();
});
