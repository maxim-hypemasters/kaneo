import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { PropertiesRail } from "./properties-rail";

const { mocks, passThrough } = vi.hoisted(() => ({
  mocks: {
    properties: {} as Record<string, unknown>,
    typeMenu: vi.fn(),
  },
  passThrough: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./use-task-properties", () => ({
  useTaskProperties: () => mocks.properties,
}));
vi.mock("../custom-fields/task-custom-field-rows", () => ({
  TaskCustomFieldRows: () => null,
}));
vi.mock("../task-status-popover", () => ({ default: passThrough }));
vi.mock("../task-priority-popover", () => ({ default: passThrough }));
vi.mock("../task-assignee-popover", () => ({ default: passThrough }));
vi.mock("../task-labels-popover", () => ({ default: passThrough }));
vi.mock("../task-start-date-popover", () => ({ default: passThrough }));
vi.mock("../task-due-date-popover", () => ({ default: passThrough }));
vi.mock("../task-move-popover", () => ({ default: passThrough }));
vi.mock("../features/task-feature-popover", () => ({
  TaskFeaturePopover: passThrough,
}));
vi.mock("../features/task-type-menu", () => ({
  TaskTypeMenu: (props: { hasTasks: boolean; children: ReactNode }) => {
    mocks.typeMenu(props.hasTasks);
    return props.children;
  },
}));
vi.mock("@/lib/format", () => ({ formatDateShort: String }));
vi.mock("@/lib/i18n/domain", () => ({ getPriorityLabel: String }));
vi.mock("@/components/shortcuts/shortcut-keys", () => ({
  ShortcutKeys: () => null,
}));

const task = {
  id: "task-1",
  title: "Cart",
  status: "to-do",
  priority: "no-priority",
  userId: null,
  assigneeName: null,
  startDate: null,
  dueDate: null,
  projectId: "project-1",
  type: "task",
  featureId: "checkout",
};

function renderRail(values: Record<string, unknown>) {
  mocks.properties = {
    task,
    project: { name: "Website", icon: null },
    labels: [],
    status: { label: "To Do", isFinal: false, icon: null },
    assignee: undefined,
    dueStatus: "none",
    canMoveTask: false,
    isFeature: false,
    feature: null,
    featureDisplayId: null,
    hasFeatureTasks: false,
    ...values,
  };
  return render(
    <PropertiesRail
      taskId="task-1"
      projectId="project-1"
      workspaceId="workspace-1"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PropertiesRail", () => {
  it("shows a task's type and its feature", () => {
    renderRail({
      feature: {
        id: "checkout",
        title: "Checkout",
        number: 3,
        projectId: "project-1",
      },
      featureDisplayId: "WEB-3",
    });

    expect(screen.getByText("tasks:features.type")).toBeInTheDocument();
    expect(screen.getByText("tasks:features.typeTask")).toBeInTheDocument();
    expect(screen.getByText("tasks:features.property")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /WEB-3\s*Checkout/ }),
    ).toHaveAttribute("data-task-action", "feature");
  });

  it("says when a task has no feature", () => {
    renderRail({ feature: null });

    expect(screen.getByText("tasks:features.none")).toBeInTheDocument();
  });

  it("hides the feature property on a feature and passes its tasks on", () => {
    renderRail({
      task: { ...task, type: "feature", featureId: null },
      isFeature: true,
      hasFeatureTasks: true,
    });

    expect(screen.getByText("tasks:features.typeFeature")).toBeInTheDocument();
    expect(
      screen.queryByText("tasks:features.property"),
    ).not.toBeInTheDocument();
    expect(mocks.typeMenu).toHaveBeenCalledWith(true);
  });
});
