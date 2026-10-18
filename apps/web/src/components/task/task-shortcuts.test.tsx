import { act, cleanup, fireEvent, render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { getFeatureIndex } from "@/lib/features/feature-index";
import { shortcutRegistry } from "@/lib/shortcuts/registry";
import { ShortcutTestWrapper } from "@/lib/shortcuts/shortcut-test-wrapper";
import { useRelationPickerStore } from "./task-relation-picker-store";
import { TaskShortcuts } from "./task-shortcuts";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updateAssignee: vi.fn(),
  updateDueDate: vi.fn(),
  writeText: vi.fn(),
  message: vi.fn(),
  error: vi.fn(),
  canUpdateTasks: vi.fn(),
  canAssignTasks: vi.fn(),
  task: undefined as Record<string, unknown> | undefined,
  relations: [] as unknown[],
}));

const summary = (id: string) => ({
  id,
  title: id,
  status: "to-do",
  isCompleted: false,
  priority: null,
  number: 1,
  projectId: "project-9",
  userId: null,
  assigneeName: null,
});

const featureLink = (featureId: string, taskId: string) => ({
  id: `feature:${taskId}:${featureId}`,
  sourceTaskId: featureId,
  targetTaskId: taskId,
  relationType: "subtask",
  sourceTask: summary(featureId),
  targetTask: summary(taskId),
});

const plainTask = {
  id: "task-1",
  number: 42,
  title: "Fix login",
  description: "Steps to reproduce",
  dueDate: "2026-10-20T00:00:00.000Z",
  userId: null,
  projectId: "project-9",
  type: "task",
  featureId: null,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: mocks.updateAssignee }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-due-date", () => ({
  useUpdateTaskDueDate: () => ({ mutateAsync: mocks.updateDueDate }),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: mocks.task }),
}));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { slug: "KAN" } }),
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: undefined }),
}));
vi.mock(
  "@/hooks/queries/github-integration/use-get-github-integration",
  () => ({
    default: () => ({ data: undefined }),
  }),
);
vi.mock("@/hooks/queries/gitea-integration/use-get-gitea-integration", () => ({
  default: () => ({ data: undefined }),
}));
vi.mock(
  "@/hooks/queries/gitlab-integration/use-get-gitlab-integration",
  () => ({
    default: () => ({ data: undefined }),
  }),
);
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => ({ data: mocks.relations, isSuccess: true }),
}));
vi.mock("@/hooks/queries/task/use-feature-index", () => ({
  useFeatureIndex: () => getFeatureIndex(undefined),
}));
vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: mocks.canUpdateTasks,
    canAssignTasks: mocks.canAssignTasks,
  }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { message: mocks.message, error: mocks.error },
}));

const onStatus = vi.fn();
const onAddSubtask = vi.fn();
const onFeature = vi.fn();
const onRelease = vi.fn();

function renderTaskShortcuts(
  enabled = true,
  { withFeatureProperty = false } = {},
) {
  return render(
    <ShortcutTestWrapper>
      <div data-task-view>
        <button type="button" data-task-action="status" onClick={onStatus} />
        <button
          type="button"
          data-task-action="addSubtask"
          onClick={onAddSubtask}
        />
        {withFeatureProperty && (
          <button
            type="button"
            data-task-action="feature"
            onClick={onFeature}
          />
        )}
        <button type="button" data-task-action="release" onClick={onRelease} />
      </div>
      <TaskShortcuts
        taskId="task-1"
        projectId="project-1"
        workspaceId="workspace-1"
        enabled={enabled}
      />
    </ShortcutTestWrapper>,
  );
}

function press(init: KeyboardEventInit) {
  fireEvent.keyDown(document, init);
}

beforeEach(() => {
  mocks.task = plainTask;
  mocks.relations = [];
  mocks.canUpdateTasks.mockReturnValue(true);
  mocks.canAssignTasks.mockReturnValue(true);
  mocks.updateAssignee.mockResolvedValue({});
  mocks.updateDueDate.mockResolvedValue({});
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([
    new DOMRect(),
  ] as unknown as DOMRectList);
});

afterEach(() => {
  cleanup();
  shortcutRegistry.reset();
  useRelationPickerStore.getState().clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("TaskShortcuts", () => {
  it("opens the status picker of the open task", () => {
    renderTaskShortcuts();

    press({ key: "s", code: "KeyS" });

    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it("assigns the task to the current user", async () => {
    renderTaskShortcuts();

    press({ key: "i", code: "KeyI" });
    await act(async () => {});

    expect(mocks.updateAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", userId: "user-1" }),
    );
    expect(mocks.message).toHaveBeenCalledWith("tasks:shortcuts.assignedToMe", {
      icon: expect.anything(),
    });
  });

  it("removes the due date", async () => {
    renderTaskShortcuts();

    press({ key: "D", code: "KeyD", ctrlKey: true, shiftKey: true });
    await act(async () => {});

    expect(mocks.updateDueDate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", dueDate: null }),
    );
  });

  it("copies the task ID, title and Markdown", async () => {
    renderTaskShortcuts();

    press({ key: ".", code: "Period", ctrlKey: true });
    press({ key: '"', code: "Quote", ctrlKey: true, shiftKey: true });
    press({ key: "ç", code: "KeyC", ctrlKey: true, altKey: true });
    await act(async () => {});

    expect(mocks.writeText.mock.calls).toEqual([
      ["KAN-42"],
      ["Fix login"],
      ["# Fix login\n\nSteps to reproduce"],
    ]);
  });

  it("reports a clipboard failure", async () => {
    mocks.writeText.mockRejectedValue(new Error("Denied"));
    renderTaskShortcuts();

    press({ key: ".", code: "Period", ctrlKey: true });
    await act(async () => {});

    expect(mocks.message).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("tasks:shortcuts.copyFailed");
  });

  it("opens the relation picker in blocked by mode", () => {
    renderTaskShortcuts();

    press({ key: "m", code: "KeyM" });
    press({ key: "b", code: "KeyB" });

    expect(useRelationPickerStore.getState().request).toEqual({
      taskId: "task-1",
      mode: "blockedBy",
    });
  });

  it("opens the task's feature in the feature's project", () => {
    mocks.task = { ...plainTask, featureId: "feature-1" };
    mocks.relations = [featureLink("feature-1", "task-1")];
    renderTaskShortcuts();

    press({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true, shiftKey: true });

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate.mock.calls[0]?.[0].params).toEqual({
      workspaceId: "workspace-1",
      projectId: "project-9",
      taskId: "feature-1",
    });
  });

  it("opens the first task of a feature", () => {
    mocks.task = { ...plainTask, type: "feature" };
    mocks.relations = [
      featureLink("task-1", "child-1"),
      featureLink("task-1", "child-2"),
    ];
    renderTaskShortcuts();

    press({
      key: "ArrowDown",
      code: "ArrowDown",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate.mock.calls[0]?.[0].params).toEqual({
      workspaceId: "workspace-1",
      projectId: "project-9",
      taskId: "child-1",
    });
  });

  it("adds tasks only to a feature", () => {
    const { unmount } = renderTaskShortcuts();
    press({ key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
    expect(onAddSubtask).not.toHaveBeenCalled();
    unmount();
    shortcutRegistry.reset();

    mocks.task = { ...plainTask, type: "feature" };
    renderTaskShortcuts();
    press({ key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
    expect(onAddSubtask).toHaveBeenCalledTimes(1);
  });

  it("picks a feature for a task, but not for a feature", () => {
    const { unmount } = renderTaskShortcuts();
    press({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true });
    expect(useRelationPickerStore.getState().request).toEqual({
      taskId: "task-1",
      mode: "feature",
    });
    unmount();
    shortcutRegistry.reset();
    useRelationPickerStore.getState().clear();

    mocks.task = { ...plainTask, type: "feature" };
    renderTaskShortcuts();
    press({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true });
    expect(useRelationPickerStore.getState().request).toBeNull();
  });

  it("opens the Feature property when it's on screen", () => {
    renderTaskShortcuts(true, { withFeatureProperty: true });

    press({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true });

    expect(onFeature).toHaveBeenCalledTimes(1);
    expect(useRelationPickerStore.getState().request).toBeNull();
  });

  it("opens the Release property of a task or a feature", () => {
    const { unmount } = renderTaskShortcuts();
    press({ key: "C", code: "KeyC", shiftKey: true });
    expect(onRelease).toHaveBeenCalledTimes(1);
    unmount();
    shortcutRegistry.reset();

    mocks.task = { ...plainTask, type: "feature" };
    renderTaskShortcuts();
    press({ key: "C", code: "KeyC", shiftKey: true });
    expect(onRelease).toHaveBeenCalledTimes(2);
  });

  it("keeps copy shortcuts but blocks edits without update permission", async () => {
    mocks.canUpdateTasks.mockReturnValue(false);
    renderTaskShortcuts();

    press({ key: "s", code: "KeyS" });
    press({ key: "C", code: "KeyC", shiftKey: true });
    press({ key: "m", code: "KeyM" });
    press({ key: "b", code: "KeyB" });
    press({ key: ".", code: "Period", ctrlKey: true });
    await act(async () => {});

    expect(onStatus).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled();
    expect(useRelationPickerStore.getState().request).toBeNull();
    expect(mocks.writeText).toHaveBeenCalledWith("KAN-42");
  });

  it("does not assign without assign permission", async () => {
    mocks.canAssignTasks.mockReturnValue(false);
    renderTaskShortcuts();

    press({ key: "i", code: "KeyI" });
    await act(async () => {});

    expect(mocks.updateAssignee).not.toHaveBeenCalled();
  });

  it("stays off while the task view is closed", async () => {
    renderTaskShortcuts(false);

    press({ key: "s", code: "KeyS" });
    press({ key: ".", code: "Period", ctrlKey: true });
    await act(async () => {});

    expect(onStatus).not.toHaveBeenCalled();
    expect(mocks.writeText).not.toHaveBeenCalled();
  });
});
