vi.mock("@/components/scheduling/use-project-schedule", () => ({
  useGetProjectSchedule: () => ({
    data: undefined,
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/queries/milestone/use-get-project-milestones", () => {
  const data: never[] = [];
  return {
    useGetProjectMilestones: () => ({
      data,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }),
  };
});
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
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
  toastError: vi.fn(),
  project: null as unknown,
  groupBy: "none",
  relations: [] as {
    id: string;
    sourceTaskId: string;
    targetTaskId: string;
    relationType: string;
  }[],
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
  useGetTasks: () => ({ data: m.project, isSuccess: true }),
}));
vi.mock("@/hooks/queries/task-relation/use-get-project-task-relations", () => ({
  default: () => ({ data: m.relations }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: m.update }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canAssignTasks: () => true,
    canUpdateProjects: () => true,
    canUpdateTasks: () => true,
  }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: [], isSuccess: true }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/store/user-preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/store/user-preferences")>()),
  useUserPreferencesStore: (
    selector: (state: {
      weekStartsOn: number;
      ganttGroupBy: string;
    }) => unknown,
  ) => selector({ weekStartsOn: 1, ganttGroupBy: m.groupBy }),
}));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusLabel: (status: string) => status,
  getPriorityLabel: (priority: string) => priority,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const detail = options?.title ?? options?.count;
      return detail === undefined ? key : `${key}:${String(detail)}`;
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: m.toastError } }));
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
    releases: [],
    releasesLoading: false,
  }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => {
  const noReleases = { data: [], isPending: false };
  return { useGetReleases: () => noReleases };
});
const noCustomFieldValues = () => [];
vi.mock(
  "@/hooks/queries/custom-field/use-get-all-custom-field-values-by-project",
  () => ({
    default: () => ({ getValuesForTask: noCustomFieldValues }),
  }),
);

await import("@/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/gantt");

class TestPointerEvent extends MouseEvent {
  pointerType: string;
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
    this.pointerId = init.pointerId ?? 1;
  }
}

function task(
  id: string,
  startDate: string | null,
  dueDate: string,
  hierarchy: { type?: "task" | "feature"; featureId?: string | null } = {},
) {
  return {
    ...hierarchy,
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
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: null as string | null,
    assigneeId: null as string | null,
    assigneeName: null as string | null,
    assigneeImage: null,
  };
}

function show() {
  const Component = m.component;
  return render(<Component />);
}

const bar = (title: string) =>
  screen.getByRole("button", { name: `tasks:gantt.taskAriaLabel:${title}` });
// 44px day columns (see the clientWidth stub), so dx 88 is two days.
function dragBy(target: HTMLElement, dx: number) {
  startDrag(target, dx);
  fireEvent.pointerUp(window, { clientX: 500 + dx, clientY: 300 });
}

function startDrag(target: HTMLElement, dx: number) {
  fireEvent.pointerDown(target, { button: 0, clientX: 500, clientY: 300 });
  fireEvent.pointerMove(window, {
    clientX: 500 + dx,
    clientY: 300,
    buttons: 1,
  });
}

function setTasks(...tasks: ReturnType<typeof task>[]) {
  m.project = {
    name: "Project",
    slug: "PROJ",
    columns: [{ id: "col", tasks }],
    plannedTasks: [],
    archivedTasks: [],
  };
}

const blocks = (sourceTaskId: string, targetTaskId: string) => ({
  id: `${sourceTaskId}->${targetTaskId}`,
  sourceTaskId,
  targetTaskId,
  relationType: "blocks",
});

const linePaths = () =>
  screen
    .getByTestId("gantt-dependency-lines")
    .querySelectorAll<SVGPathElement>("path[marker-end]");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 31));
  m.groupBy = "none";
  m.update.mockResolvedValue({});
  // Design blocks Build: Build may start on Sep 3, the day Design ends.
  setTasks(
    task("Design", "2026-09-01", "2026-09-03"),
    task("Build", "2026-09-03", "2026-09-05"),
    task("Ship", "2026-09-07", "2026-09-08"),
  );
  m.relations = [
    {
      id: "r1",
      sourceTaskId: "Design",
      targetTaskId: "Build",
      relationType: "blocks",
    },
    {
      id: "r2",
      sourceTaskId: "Design",
      targetTaskId: "Ship",
      relationType: "related",
    },
  ];
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      const days = /repeat\((\d+),/.exec(this.style.gridTemplateColumns);
      return days ? Number(days[1]) * 44 : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

describe("Gantt dependencies", () => {
  it("draws an arrow for each blocks relation between rendered tasks", () => {
    show();

    const lines = screen.getByTestId("gantt-dependency-lines");
    // Only the blocks relation, not the related one.
    expect(lines.querySelectorAll("path[marker-end]")).toHaveLength(1);
    expect(lines.querySelector("path[data-broken]")).toBeNull();
  });

  it("fades a dragged bar's lines until it is dropped", () => {
    show();

    startDrag(bar("Build"), 88);
    expect(linePaths()[0]).toHaveAttribute("opacity", "0.25");

    fireEvent.pointerUp(window, { clientX: 588, clientY: 300 });
    expect(linePaths()[0]).not.toHaveAttribute("opacity");
  });

  it("dashes broken lines, so they don't rely on colour alone", () => {
    setTasks(
      task("Design", "2026-09-01", "2026-09-04"),
      task("Build", "2026-09-03", "2026-09-05"),
    );
    show();

    expect(linePaths()[0]).toHaveAttribute("data-broken");
    expect(linePaths()[0]).toHaveAttribute("stroke-dasharray", "4 3");
    // And in words, for screen readers.
    expect(bar("Build")).toHaveAccessibleDescription(
      "tasks:gantt.dependencies.startsBeforeBlocker:Design",
    );
    expect(bar("Design")).not.toHaveAccessibleDescription();
  });

  it("ignores knowledge Feature relations while retaining leaf dependencies", () => {
    setTasks(
      task("Knowledge", "2026-09-01", "2026-09-06", { type: "feature" }),
      task("Design", "2026-09-01", "2026-09-03"),
      task("Build", "2026-09-03", "2026-09-05"),
    );
    m.relations = [blocks("Knowledge", "Build"), blocks("Design", "Build")];
    const { container } = show();
    expect(container.querySelector('[data-gantt-row="Knowledge"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /featureBar/ })).toBeNull();
    dragBy(
      screen.getByRole("button", { name: "tasks:gantt.taskAriaLabel:Design" }),
      88,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.update).not.toHaveBeenCalled();
    expect(linePaths()).toHaveLength(1);
  });

  it("keeps dates and dependent work fixed during horizontal gestures", () => {
    const { container } = show();
    const before = container
      .querySelector('[data-gantt-row="Design"] [data-gantt-bar]')
      ?.getAttribute("style");
    dragBy(bar("Design"), 88);
    expect(m.update).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      container
        .querySelector('[data-gantt-row="Design"] [data-gantt-bar]')
        ?.getAttribute("style"),
    ).toBe(before);
    expect(
      screen.queryByRole("button", { name: "tasks:gantt.resizeStart" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "tasks:gantt.resizeDue" }),
    ).toBeNull();
  });
});
