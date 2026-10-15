import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const m = vi.hoisted(() => ({
  component: (() => null) as ComponentType,
  navigate: vi.fn(),
  update: vi.fn(),
  tasks: [] as Record<string, unknown>[],
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    m.component = options.component;
    return {
      useParams: () => ({ projectId: "project", workspaceId: "workspace" }),
      useSearch: () => ({}),
    };
  },
  useNavigate: () => m.navigate,
}));
vi.mock("@/components/common/project-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/task/task-details-sheet", () => ({
  default: () => null,
}));
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({
    isSuccess: true,
    data: {
      name: "Project",
      slug: "PROJ",
      columns: [{ tasks: m.tasks }],
      plannedTasks: [],
    },
  }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: m.update }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: m.update }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canAssignTasks: () => true }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: [], isSuccess: true }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => 1,
}));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusLabel: (status: string) => status,
  getPriorityLabel: (priority: string) => priority,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/hooks/queries/task/use-description-matches", () => ({
  useDescriptionMatches: () => ({
    ids: new Set<string>(),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/components/project/task-filters/use-task-filter-options", () => ({
  useTaskFilterOptions: () => ({
    members: [],
    labels: [],
    customFields: [],
    usedCustomFieldValues: {},
  }),
}));
const noCustomFieldValues = () => [];
vi.mock(
  "@/hooks/queries/custom-field/use-get-all-custom-field-values-by-project",
  () => ({
    default: () => ({ getValuesForTask: noCustomFieldValues }),
  }),
);

await import("@/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/gantt");
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("PointerEvent", MouseEvent);
});
function task(id: string, startDate: string, dueDate: string) {
  return {
    id,
    projectId: "project",
    title: id,
    number: 1,
    status: "to-do",
    startDate,
    dueDate,
    description: "",
    labels: [],
    priority: "low",
    position: 1,
  };
}
function show() {
  const Component = m.component;
  return render(<Component />);
}

describe("Gantt window UI", () => {
  it("renders a bounded grid for a centuries-long legacy task and makes clipped bars safe to open", () => {
    m.tasks = [task("Long-lived", "0001-01-01", "9999-12-31")];
    const { container } = show();
    const grids = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[style*="grid-template-columns: repeat"]',
      ),
    );
    expect(grids.length).toBeGreaterThan(0);
    expect(
      grids.every((grid) =>
        /repeat\(182,/.test(grid.style.gridTemplateColumns),
      ),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "tasks:gantt.resizeStart" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "tasks:gantt.resizeDue" }),
    ).toBeDisabled();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "tasks:gantt.taskAriaLabel" }),
      {
        button: 0,
      },
    );
    expect(m.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { taskId: "Long-lived" } }),
    );
    expect(m.update).not.toHaveBeenCalled();
  });

  it("can jump to a far-away date and navigate without losing rows", () => {
    m.tasks = [
      task("Ancient", "0001-01-01", "0001-01-02"),
      task("Future", "9999-12-30", "9999-12-31"),
    ];
    const { container } = show();
    // The span opens around today, far from both tasks.
    expect(
      screen.queryAllByRole("button", { name: "tasks:gantt.taskAriaLabel" }),
    ).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("tasks:gantt.periodStart"), {
      target: { value: "9999-12-23" },
    });
    expect(
      screen.getAllByRole("button", { name: "tasks:gantt.taskAriaLabel" }),
    ).toHaveLength(1);

    // The span re-centres on the far task, clamped to the last supported
    // day, and stays bounded.
    expect(screen.getByLabelText("tasks:gantt.periodStart")).toHaveValue(
      "9999-07-03",
    );
    expect(
      screen.getByRole("button", { name: "tasks:gantt.nextPeriod" }),
    ).toBeDisabled();
    expect(screen.getByText("Ancient")).toBeInTheDocument();
    expect(
      container.querySelectorAll('[style*="repeat(182,"]').length,
    ).toBeGreaterThan(0);
  });

  it("supports entering a date directly while keeping the allocated period bounded", () => {
    m.tasks = [task("Long-lived", "0001-01-01", "9999-12-31")];
    const { container } = show();
    fireEvent.change(screen.getByLabelText("tasks:gantt.periodStart"), {
      target: { value: "2050-01-01" },
    });
    // Re-centred: Monday Dec 27, 2049 (the week of Jan 1) less eight weeks.
    expect(screen.getByLabelText("tasks:gantt.periodStart")).toHaveValue(
      "2049-11-01",
    );
    expect(
      container.querySelectorAll('[style*="repeat(182,"]').length,
    ).toBeGreaterThan(0);
  });
});
