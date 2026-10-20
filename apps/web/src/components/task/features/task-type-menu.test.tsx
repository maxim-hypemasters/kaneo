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
  it("converts a Task to Bug", async () => {
    const task = renderMenu("task");
    await clickItem("tasks:features.convertToBug");
    expect(mocks.updateType).toHaveBeenCalledWith({ task, type: "bug" });
    expect(
      screen.queryByRole("menuitem", {
        name: "tasks:features.convertToFeature",
      }),
    ).not.toBeInTheDocument();
  });
  it("converts a Bug to Task", async () => {
    const task = renderMenu("bug");
    await clickItem("tasks:features.convertToTask");
    expect(mocks.updateType).toHaveBeenCalledWith({ task, type: "task" });
  });
  it.each([false, true])(
    "keeps Feature type immutable with children %s",
    (hasTasks) => {
      renderMenu("feature", hasTasks);
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
      expect(mocks.updateType).not.toHaveBeenCalled();
    },
  );
  it("reports a failed leaf conversion", async () => {
    mocks.updateType.mockRejectedValue(new Error("Server error"));
    renderMenu("task");
    await clickItem("tasks:features.convertToBug");
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
