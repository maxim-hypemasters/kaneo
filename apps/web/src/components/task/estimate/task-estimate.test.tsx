import {
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
import type Task from "@/types/task";
import { TaskEstimate } from "./task-estimate";

const mocks = vi.hoisted(() => ({
  canEdit: true,
  save: vi.fn(),
  error: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: () => mocks.canEdit }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ isPending: false, mutateAsync: mocks.save }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.error } }));

const task = {
  id: "task",
  projectId: "project",
  title: "Work",
  type: "task",
  estimateSeconds: 28_800,
} as Task;
beforeEach(() => {
  mocks.canEdit = true;
  mocks.save.mockReset();
  mocks.error.mockReset();
});
afterEach(cleanup);

describe("task estimate shorthand", () => {
  it("displays saved canonical effort as compact work units for read-only users", () => {
    mocks.canEdit = false;
    const { rerender } = render(<TaskEstimate task={task} />);
    expect(screen.getByText("1d")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<TaskEstimate task={{ ...task, estimateSeconds: 432_000 }} />);
    expect(screen.getByText("3w")).toBeVisible();
  });

  it("retains shorthand after a failed save and retries canonical seconds", async () => {
    mocks.save
      .mockRejectedValueOnce(new Error("Try again"))
      .mockResolvedValueOnce({});
    render(<TaskEstimate task={task} />);
    fireEvent.click(screen.getByRole("button", { name: "1d" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
      { target: { value: "1d4h" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    );
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Try again"));
    expect(screen.getByRole("textbox")).toHaveValue("1d4h");
    expect(mocks.save).toHaveBeenLastCalledWith({
      ...task,
      estimateSeconds: 43_200,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });

  it("clears invalid local shorthand before saving an empty estimate", async () => {
    mocks.save.mockResolvedValue({});
    render(<TaskEstimate task={{ ...task, estimateSeconds: null }} />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.empty" }),
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3x" } });
    expect(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.clear" }),
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    ).toBeEnabled();
  });
});
