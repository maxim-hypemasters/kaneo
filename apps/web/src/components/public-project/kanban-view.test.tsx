import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import { PublicKanbanView } from "./kanban-view";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { title?: string }) =>
      values?.title ? `${key}|${values.title}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

afterEach(cleanup);

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    description: null,
    status: "todo",
    priority: null,
    startDate: null,
    dueDate: null,
    position: 0,
    createdAt: "2026-10-01T00:00:00Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId: "p",
    type: "task",
    featureId: null,
    ...values,
  }) as Task;

it("names each task's feature from the public board, wherever it sits", () => {
  const feature = task("checkout", {
    title: "Checkout",
    status: "done",
    type: "feature",
    subtaskCounts: { completed: 0, total: 1 },
  });
  const project = {
    id: "p",
    slug: "SHOP",
    columns: [
      {
        id: "todo",
        name: "To do",
        isFinal: false,
        tasks: [
          task("cart", { featureId: "checkout" }),
          task("orphan", { featureId: "not-public" }),
        ],
      },
      { id: "done", name: "Done", isFinal: true, tasks: [feature] },
    ],
    plannedTasks: [],
    archivedTasks: [],
  } as unknown as ProjectWithTasks;
  const onTaskClick = vi.fn();

  render(<PublicKanbanView project={project} onTaskClick={onTaskClick} />);

  expect(screen.getByText("tasks:features.badge")).toBeVisible();
  const chips = screen.getAllByRole("button", { name: /features.chipLabel/ });
  expect(chips).toHaveLength(1);
  fireEvent.click(chips[0]);
  expect(onTaskClick).toHaveBeenCalledExactlyOnceWith(feature);
});

it("marks a completed Bug without changing its public task action", () => {
  const bug = task("crash", { type: "bug", status: "done" });
  const project = {
    id: "p",
    slug: "SHOP",
    columns: [{ id: "done", name: "Done", isFinal: true, tasks: [bug] }],
    plannedTasks: [],
    archivedTasks: [],
  } as unknown as ProjectWithTasks;
  const onTaskClick = vi.fn();
  render(<PublicKanbanView project={project} onTaskClick={onTaskClick} />);
  expect(
    screen.getByRole("img", { name: "tasks:features.typeBug" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /crash/ }));
  expect(onTaskClick).toHaveBeenCalledWith(bug);
});
