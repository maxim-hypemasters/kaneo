import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import type { TaskType } from "@/types/task";
import { TaskTypeMenu } from "./task-type-menu";

const mocks = vi.hoisted(() => ({
  updateType: vi.fn(),
  toastError: vi.fn(),
  canUpdateTasks: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-type", () => ({
  useUpdateTaskType: () => ({
    mutateAsync: mocks.updateType,
    isPending: false,
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: mocks.canUpdateTasks }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));

function renderMenu(type: TaskType, hasTasks = false) {
  const task = { id: "task-1", projectId: "project-1", featureId: null, type };
  render(
    <TaskTypeMenu task={task} hasTasks={hasTasks}>
      <button type="button">Type</button>
    </TaskTypeMenu>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Type" }));
  return task;
}

async function clickItem(name: string) {
  await act(async () => {
    fireEvent.click(await screen.findByRole("menuitem", { name }));
  });
}

beforeEach(() => {
  mocks.canUpdateTasks.mockReturnValue(true);
  mocks.updateType.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskTypeMenu", () => {
  it("converts a task into a feature", async () => {
    const task = renderMenu("task");

    await clickItem("tasks:features.convertToFeature");

    await waitFor(() =>
      expect(mocks.updateType).toHaveBeenCalledWith({ task, type: "feature" }),
    );
  });

  it("converts a feature without tasks back into a task", async () => {
    const task = renderMenu("feature");

    await clickItem("tasks:features.convertToTask");

    await waitFor(() =>
      expect(mocks.updateType).toHaveBeenCalledWith({ task, type: "task" }),
    );
  });

  it("explains why a feature with tasks can't become a task", async () => {
    renderMenu("feature", true);

    const item = await screen.findByRole("menuitem", {
      name: "tasks:features.convertToTask",
    });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAccessibleDescription("tasks:features.convertBlocked");
    await act(async () => {
      fireEvent.click(item);
    });
    expect(mocks.updateType).not.toHaveBeenCalled();
  });

  it("explains a conflict the view didn't know about", async () => {
    mocks.updateType.mockRejectedValue(
      new HttpError(409, "This feature still has tasks."),
    );
    renderMenu("feature");

    await clickItem("tasks:features.convertToTask");

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "tasks:features.convertBlocked",
      ),
    );
  });

  it("reports other failures", async () => {
    mocks.updateType.mockRejectedValue(new Error("Server error"));
    renderMenu("task");

    await clickItem("tasks:features.convertToFeature");

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Server error"),
    );
  });

  it("stays closed without update permission", () => {
    mocks.canUpdateTasks.mockReturnValue(false);
    renderMenu("task");

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});
