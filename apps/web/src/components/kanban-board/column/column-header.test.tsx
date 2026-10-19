import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { ProjectWithTasks } from "@/types/project";
import type { TaskType } from "@/types/task";
import { ColumnHeader } from "./column-header";
const m = vi.hoisted(() => ({
  project: undefined as ProjectWithTasks | undefined,
  archive: {} as {
    onConfirm?: () => void;
    disabled?: boolean;
    taskCount?: number;
  },
  mutate: vi.fn(),
  setProject: vi.fn(),
  canCreate: true,
  creation: {} as {
    open: boolean;
    type: TaskType;
    projectId?: string;
    status?: string;
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutate: m.mutate }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => true,
    canCreateTasks: () => m.canCreate,
  }),
}));
vi.mock("@/store/project", () => ({
  default: () => ({ project: m.project, setProject: m.setProject }),
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: (props: typeof m.creation) => {
    m.creation = props;
    return null;
  },
}));
vi.mock("../../shared/modals/archive-tasks-modal", () => ({
  ArchiveTasksModal: (props: typeof m.archive) => {
    m.archive = props;
    return null;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  m.canCreate = true;
});

it.each(["task", "feature", "bug"] as const)(
  "creates %s in the selected board column",
  (type) => {
    const column = {
      id: "review",
      name: "Review",
      tasks: [],
    } as unknown as ProjectWithTasks["columns"][number];
    m.project = { id: "p", columns: [column] } as ProjectWithTasks;
    render(<ColumnHeader column={column} />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:createMenu.label" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: `tasks:createMenu.new${type[0].toUpperCase()}${type.slice(1)}`,
      }),
    );
    expect(m.creation).toMatchObject({
      open: true,
      type,
      status: "review",
      projectId: "p",
    });
  },
);

it("hides board column creation without permission", () => {
  m.canCreate = false;
  const column = {
    id: "todo",
    name: "To do",
    tasks: [],
  } as unknown as ProjectWithTasks["columns"][number];
  render(<ColumnHeader column={column} />);
  expect(
    screen.queryByRole("button", { name: "tasks:createMenu.label" }),
  ).toBeNull();
});
it("prevents archive confirmation while the board is partial and uses the completed column afterward", () => {
  const column = {
    id: "done",
    name: "Done",
    slug: "done",
    isFinal: true,
    tasks: [{ id: "a" }],
  } as unknown as ProjectWithTasks["columns"][number];
  m.project = { id: "p", columns: [column] } as ProjectWithTasks;
  const { rerender } = render(<ColumnHeader column={column} />);
  fireEvent.click(screen.getByTitle(/archiveAllTooltip/));
  rerender(<ColumnHeader column={column} disableCollectionActions />);
  expect(screen.getByTitle(/archiveAllTooltip/).hasAttribute("disabled")).toBe(
    true,
  );
  expect(m.archive.disabled).toBe(true);
  act(() => m.archive.onConfirm?.());
  expect(m.mutate).not.toHaveBeenCalled();
  expect(m.setProject).not.toHaveBeenCalled();
  const complete = {
    ...column,
    tasks: [...column.tasks, { id: "b" }],
  } as typeof column;
  m.project = { ...m.project, columns: [complete] };
  rerender(<ColumnHeader column={complete} />);
  expect(m.archive.taskCount).toBe(2);
  act(() => m.archive.onConfirm?.());
  expect(m.mutate).toHaveBeenCalledTimes(2);
  expect(m.setProject).toHaveBeenCalledOnce();
});
