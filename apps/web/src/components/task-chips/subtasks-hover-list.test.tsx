import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import { SubtasksHoverList } from "./subtasks-hover-list";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { completed?: number; total?: number }) =>
      values?.total !== undefined
        ? `${key}|${values.completed}/${values.total}`
        : key,
  }),
}));

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    projectId: "p",
    status: "todo",
    userId: null,
    assigneeName: null,
    type: "task",
    featureId: "checkout",
    ...values,
  }) as Task;

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

afterEach(() => {
  cleanup();
  queryClient.clear();
});

it("lists the feature's tasks from the cached board", () => {
  queryClient.setQueryData(["tasks", "p"], {
    id: "p",
    slug: "SHOP",
    columns: [
      {
        id: "todo",
        slug: "todo",
        isFinal: false,
        tasks: [
          task("checkout", { type: "feature", featureId: null }),
          task("cart", { number: 2 }),
          task("unrelated", { featureId: null }),
        ],
      },
      {
        id: "done",
        slug: "done",
        isFinal: true,
        tasks: [task("form", { number: 3, status: "done" })],
      },
    ],
    plannedTasks: [],
    archivedTasks: [],
  } as unknown as ProjectWithTasks);
  const onOpenTask = vi.fn();

  render(
    <SubtasksHoverList
      featureId="checkout"
      projectId="p"
      onOpenTask={onOpenTask}
    />,
    { wrapper },
  );

  expect(screen.getByText("tasks:subtasks.progress|1/2")).toBeVisible();
  expect(screen.getByText("SHOP-2")).toBeVisible();
  expect(screen.getByText("form")).toHaveClass("line-through");
  expect(screen.queryByText("unrelated")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /cart/ }));
  expect(onOpenTask).toHaveBeenCalledExactlyOnceWith("cart");
});

it("says the feature has no tasks when the board holds none", () => {
  queryClient.setQueryData(["tasks", "p"], {
    id: "p",
    columns: [],
    plannedTasks: [],
    archivedTasks: [],
  } as unknown as ProjectWithTasks);
  render(
    <SubtasksHoverList
      featureId="checkout"
      projectId="p"
      onOpenTask={vi.fn()}
    />,
    { wrapper },
  );
  expect(screen.getByText("tasks:subtasks.empty")).toBeVisible();
});

it("waits for the board instead of calling the feature empty", () => {
  render(
    <SubtasksHoverList
      featureId="checkout"
      projectId="p"
      onOpenTask={vi.fn()}
    />,
    { wrapper },
  );
  expect(screen.getByText("common:empty.loading")).toBeVisible();
  expect(screen.queryByText("tasks:subtasks.empty")).not.toBeInTheDocument();
});
