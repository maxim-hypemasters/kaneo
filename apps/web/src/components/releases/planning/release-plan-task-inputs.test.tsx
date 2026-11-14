import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { ReleasePlanTaskInputs } from "./release-plan-task-inputs";

const m = vi.hoisted(() => ({
  estimate: vi.fn(),
  assignee: vi.fn(),
  members: vi.fn(),
  retry: vi.fn(),
  canEstimate: true,
  canAssign: true,
  memberError: false,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/i18n/domain", () => ({
  getPriorityLabel: (priority: string) => `tasks:priority.${priority}`,
}));
vi.mock("@/fetchers/task/bulk-operation", () => ({ default: m.estimate }));
vi.mock("@/fetchers/task/update-task-assignee", () => ({
  default: m.assignee,
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canWorkItem: () => m.canEstimate,
    canAssignTasks: () => m.canAssign,
  }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: (params: unknown) => {
    m.members(params);
    return {
      data: [
        { id: "max", name: "Max", email: "max@example.com" },
        { id: "sam", name: "Sam", email: "sam@example.com" },
      ],
      isPending: false,
      isError: m.memberError,
      refetch: m.retry,
    };
  },
}));

const task = {
  taskId: "task",
  type: "task" as const,
  currentAssigneeId: "max",
  currentAssigneeName: "Max",
  estimateSeconds: 28_800,
  priority: "medium",
};
let client: QueryClient;
const props = () => ({
  task,
  projectId: "project",
  workspaceId: "workspace",
  onSavingChange: vi.fn(),
  onSaved: vi.fn(),
});
function wrap({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function estimateButton() {
  return screen.getByRole("button", { name: "tasks:estimate.label: 1d" });
}
function assigneeButton() {
  return screen.getByRole("button", { name: "tasks:assignee.label: Max" });
}
function priorityButton() {
  return screen.getByRole("button", {
    name: "tasks:priority.label: tasks:priority.medium",
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.canEstimate = true;
  m.canAssign = true;
  m.memberError = false;
  m.estimate.mockResolvedValue({ success: true, updatedCount: 1 });
  m.assignee.mockResolvedValue({});
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(["task", "task"], { id: "task", projectId: "project" });
  client.setQueryData(["project-schedule", "project"], {});
  client.setQueryData(["assigned-tasks", "workspace"], {});
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("inline release planning inputs", () => {
  it("edits estimates with only the narrow canonical payload and refreshes shared work caches", async () => {
    const input = props();
    render(<ReleasePlanTaskInputs {...input} />, { wrapper: wrap });
    expect(m.members).toHaveBeenLastCalledWith({
      workspaceId: "workspace",
      projectId: "project",
      enabled: false,
    });
    fireEvent.click(estimateButton());
    fireEvent.change(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
      { target: { value: "1d4h" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    );
    await waitFor(() =>
      expect(input.onSaved).toHaveBeenCalledWith({ estimateSeconds: 43_200 }),
    );
    expect(m.estimate).toHaveBeenCalledExactlyOnceWith({
      taskIds: ["task"],
      operation: "updateEstimate",
      value: "43200",
    });
    expect(m.assignee).not.toHaveBeenCalled();
    expect(input.onSavingChange.mock.calls).toEqual([[true], [false]]);
    for (const key of [
      ["task", "task"],
      ["project-schedule", "project"],
      ["assigned-tasks", "workspace"],
    ])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("selects from the existing project-member picker and saves only the assignee", async () => {
    const input = props();
    render(<ReleasePlanTaskInputs {...input} />, { wrapper: wrap });
    fireEvent.click(assigneeButton());
    expect(m.members).toHaveBeenLastCalledWith({
      workspaceId: "workspace",
      projectId: "project",
      enabled: true,
    });
    fireEvent.click(await screen.findByRole("option", { name: /Sam/ }));
    await waitFor(() =>
      expect(input.onSaved).toHaveBeenCalledWith({
        currentAssigneeId: "sam",
        currentAssigneeName: "Sam",
      }),
    );
    expect(m.assignee).toHaveBeenCalledExactlyOnceWith("task", {
      userId: "sam",
    });
    expect(m.estimate).not.toHaveBeenCalled();
  });

  it("keeps failed estimate drafts visible through background input refreshes and supports retry", async () => {
    m.estimate
      .mockRejectedValueOnce(new Error("Retry this estimate"))
      .mockResolvedValueOnce({ success: true });
    const input = props();
    const view = render(<ReleasePlanTaskInputs {...input} />, {
      wrapper: wrap,
    });
    fireEvent.click(estimateButton());
    fireEvent.change(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
      { target: { value: "3w" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    );
    await screen.findByText("Retry this estimate");
    view.rerender(
      <ReleasePlanTaskInputs
        {...input}
        task={{ ...task, estimateSeconds: 3600 }}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
    ).toHaveValue("3w");
    expect(input.onSaved).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    );
    await waitFor(() =>
      expect(input.onSaved).toHaveBeenCalledWith({ estimateSeconds: 432_000 }),
    );
    expect(m.estimate).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed assignee selection available for retry", async () => {
    m.assignee
      .mockRejectedValueOnce(new Error("Cannot assign yet"))
      .mockResolvedValueOnce({});
    const input = props();
    render(<ReleasePlanTaskInputs {...input} />, { wrapper: wrap });
    fireEvent.click(assigneeButton());
    fireEvent.click(await screen.findByRole("option", { name: /Sam/ }));
    await screen.findByText("Cannot assign yet");
    expect(screen.getByRole("option", { name: /Sam/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(input.onSaved).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    await waitFor(() =>
      expect(input.onSaved).toHaveBeenCalledWith({
        currentAssigneeId: "sam",
        currentAssigneeName: "Sam",
      }),
    );
    expect(m.assignee).toHaveBeenCalledTimes(2);
  });

  it("gates estimate and assignment controls independently", () => {
    m.canAssign = false;
    const input = props();
    const view = render(<ReleasePlanTaskInputs {...input} />, {
      wrapper: wrap,
    });
    expect(
      screen.queryByRole("button", { name: /tasks:assignee.label/ }),
    ).not.toBeInTheDocument();
    expect(estimateButton()).toBeEnabled();
    expect(priorityButton()).toBeEnabled();
    m.canAssign = true;
    m.canEstimate = false;
    view.rerender(<ReleasePlanTaskInputs {...input} />);
    expect(assigneeButton()).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /tasks:estimate.label/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /tasks:priority.label/ }),
    ).not.toBeInTheDocument();
  });

  it("saves priority using only the narrow payload and awaits the parent patch", async () => {
    let acknowledge!: () => void;
    const input = props();
    const saved = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    render(<ReleasePlanTaskInputs {...input} onSaved={saved} />, {
      wrapper: wrap,
    });
    fireEvent.click(priorityButton());
    fireEvent.click(
      await screen.findByRole("option", { name: "tasks:priority.high" }),
    );
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith({ priority: "high" }),
    );
    expect(m.estimate).toHaveBeenCalledExactlyOnceWith({
      taskIds: ["task"],
      operation: "updatePriority",
      value: "high",
    });
    expect(m.assignee).not.toHaveBeenCalled();
    expect(input.onSavingChange.mock.calls).toEqual([[true]]);
    expect(priorityButton()).toBeDisabled();
    await act(async () => acknowledge());
    await waitFor(() =>
      expect(input.onSavingChange.mock.calls).toEqual([[true], [false]]),
    );
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("retains a failed priority choice through refresh and retries it", async () => {
    m.estimate
      .mockRejectedValueOnce(new Error("Priority failed"))
      .mockResolvedValueOnce({ success: true });
    const input = props();
    const view = render(<ReleasePlanTaskInputs {...input} />, {
      wrapper: wrap,
    });
    fireEvent.click(priorityButton());
    fireEvent.click(
      await screen.findByRole("option", { name: "tasks:priority.urgent" }),
    );
    await screen.findByText("Priority failed");
    view.rerender(
      <ReleasePlanTaskInputs {...input} task={{ ...task, priority: "low" }} />,
    );
    expect(
      screen.getByRole("option", { name: "tasks:priority.urgent" }),
    ).toHaveAttribute("aria-current", "true");
    expect(input.onSaved).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    await waitFor(() =>
      expect(input.onSaved).toHaveBeenCalledWith({ priority: "urgent" }),
    );
    expect(m.estimate).toHaveBeenCalledTimes(2);
    expect(m.estimate).toHaveBeenLastCalledWith({
      taskIds: ["task"],
      operation: "updatePriority",
      value: "urgent",
    });
  });

  it("treats an unchanged priority as a no-op", async () => {
    const input = props();
    render(<ReleasePlanTaskInputs {...input} />, { wrapper: wrap });
    fireEvent.click(priorityButton());
    fireEvent.click(
      await screen.findByRole("option", { name: "tasks:priority.medium" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("option")).not.toBeInTheDocument(),
    );
    expect(m.estimate).not.toHaveBeenCalled();
    expect(input.onSaved).not.toHaveBeenCalled();
    expect(input.onSavingChange).not.toHaveBeenCalled();
  });

  it("aligns editable pills and readonly values at the same responsive control height", () => {
    const input = props();
    const view = render(<ReleasePlanTaskInputs {...input} />, {
      wrapper: wrap,
    });
    for (const button of [
      assigneeButton(),
      estimateButton(),
      priorityButton(),
    ]) {
      expect(button).toHaveClass("h-7", "sm:h-6", "border-input");
      expect(button.parentElement).toHaveClass("flex", "flex-col", "gap-1.5");
    }
    m.canEstimate = false;
    m.canAssign = false;
    view.rerender(<ReleasePlanTaskInputs {...input} />);
    for (const label of ["Max", "1d", "tasks:priority.medium"]) {
      const value = screen.getByText(label).closest("span.inline-flex");
      expect(value).toHaveClass("min-h-7", "sm:min-h-6", "items-center");
    }
  });

  it("prevents duplicates and retains the editor while the parent gates its own pending save", async () => {
    let finish!: () => void;
    m.estimate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const input = props();
    function Parent() {
      const [saving, setSaving] = useState(false);
      return (
        <ReleasePlanTaskInputs
          {...input}
          disabled={saving}
          onSavingChange={(next) => {
            setSaving(next);
            input.onSavingChange(next);
          }}
        />
      );
    }
    render(<Parent />, { wrapper: wrap });
    fireEvent.click(estimateButton());
    fireEvent.change(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
      { target: { value: "4h" } },
    );
    const save = screen.getByRole("button", { name: "tasks:estimate.save" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(m.estimate).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
    ).toHaveValue("4h");
    expect(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
    ).toBeDisabled();
    await act(async () => {
      finish();
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "tasks:estimate.label" }),
      ).not.toBeInTheDocument(),
    );
    expect(input.onSavingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps the save gate held until the parent acknowledges cache cancellation and patching", async () => {
    let acknowledge!: () => void;
    const input = props();
    const saved = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    render(<ReleasePlanTaskInputs {...input} onSaved={saved} />, {
      wrapper: wrap,
    });
    fireEvent.click(estimateButton());
    fireEvent.change(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
      { target: { value: "4h" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    );
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith({ estimateSeconds: 14_400 }),
    );
    expect(input.onSavingChange.mock.calls).toEqual([[true]]);
    expect(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
    ).toBeDisabled();
    await act(async () => {
      acknowledge();
    });
    await waitFor(() =>
      expect(input.onSavingChange.mock.calls).toEqual([[true], [false]]),
    );
  });

  it("labels missing current member metadata as unknown without clearing assignment", () => {
    render(
      <ReleasePlanTaskInputs
        {...props()}
        task={{ ...task, currentAssigneeName: null }}
      />,
      { wrapper: wrap },
    );
    expect(
      screen.getByRole("button", {
        name: "tasks:assignee.label: common:people.unknown",
      }),
    ).toBeVisible();
    expect(m.assignee).not.toHaveBeenCalled();
  });

  it("rejects invalid effort and sends null only after explicit clearing", async () => {
    const input = props();
    render(<ReleasePlanTaskInputs {...input} />, { wrapper: wrap });
    fireEvent.click(estimateButton());
    fireEvent.change(
      screen.getByRole("textbox", { name: "tasks:estimate.label" }),
      { target: { value: "3x" } },
    );
    expect(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.clear" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:estimate.save" }),
    );
    await waitFor(() =>
      expect(m.estimate).toHaveBeenCalledExactlyOnceWith({
        taskIds: ["task"],
        operation: "updateEstimate",
        value: null,
      }),
    );
    expect(input.onSaved).toHaveBeenCalledWith({ estimateSeconds: null });
  });

  it("offers member loading failure feedback and retry without assignment writes", async () => {
    m.memberError = true;
    render(<ReleasePlanTaskInputs {...props()} />, { wrapper: wrap });
    fireEvent.click(assigneeButton());
    expect(screen.getByRole("alert")).toHaveTextContent("common:error.title");
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(m.retry).toHaveBeenCalledOnce();
    expect(m.assignee).not.toHaveBeenCalled();
  });
});
