import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { PropertyChips } from "./property-chips";

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
vi.mock("../custom-fields/task-custom-field-chips", () => ({
  TaskCustomFieldChips: () => null,
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
vi.mock("../milestones/task-milestone-property", () => ({
  TaskMilestoneProperty: () => (
    <button type="button" data-testid="milestone-property">
      Milestone
    </button>
  ),
}));
vi.mock("../releases/task-release-popover", () => ({
  TaskReleasePopover: passThrough,
}));
vi.mock("../features/task-type-menu", () => ({
  TaskTypeMenu: (props: { hasTasks: boolean; children: ReactNode }) => {
    mocks.typeMenu(props.hasTasks);
    return props.children;
  },
}));
vi.mock("@/lib/format", () => ({ formatDateShort: String }));
vi.mock("@/lib/i18n/domain", () => ({ getPriorityLabel: String }));

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

function renderChips(values: Record<string, unknown>) {
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
    release: null,
    ...values,
  };
  return render(
    <PropertyChips
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

describe("PropertyChips", () => {
  it("shows a task's type and its feature", () => {
    renderChips({
      feature: {
        id: "checkout",
        title: "Checkout",
        number: 3,
        projectId: "project-1",
      },
      featureDisplayId: "WEB-3",
    });

    expect(
      screen.getByRole("button", { name: "tasks:features.typeTask" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /WEB-3\s*Checkout/ }),
    ).toHaveAttribute("data-task-action", "feature");
  });

  it("hides the feature chip on a feature and passes its tasks on", () => {
    renderChips({
      task: { ...task, type: "feature", featureId: null },
      isFeature: true,
      hasFeatureTasks: true,
    });

    expect(
      screen.getByRole("button", { name: "tasks:features.typeFeature" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("tasks:features.none")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-task-action="feature"]'),
    ).not.toBeInTheDocument();
    expect(mocks.typeMenu).toHaveBeenCalledWith(true);
  });

  it("shows the release chip after the Feature for Tasks/Bugs only", () => {
    renderChips({ release: { id: "r24", name: "2.4" } });

    const feature = document.querySelector('[data-task-action="feature"]');
    const release = screen.getByRole("button", {
      name: "tasks:releases.property 2.4",
    });
    expect(release).toHaveAttribute("data-task-action", "release");
    expect(feature?.nextElementSibling).toBe(
      screen.getByTestId("milestone-property"),
    );
    expect(screen.getByTestId("milestone-property").nextElementSibling).toBe(
      release,
    );

    cleanup();
    renderChips({
      task: { ...task, type: "feature", featureId: null },
      isFeature: true,
    });
    expect(
      document.querySelector('[data-task-action="release"]'),
    ).not.toBeInTheDocument();
    for (const property of ["status", "priority", "assignee", "dueDate"])
      expect(
        document.querySelector(`[data-task-action="${property}"]`),
      ).not.toBeInTheDocument();
  });
});
