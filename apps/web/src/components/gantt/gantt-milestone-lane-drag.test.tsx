import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { GanttMilestoneRecord } from "./gantt-types";
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
  assignment: vi.fn(),
  updateMilestone: vi.fn(),
  milestones: [] as GanttMilestoneRecord[],
  groupBy: "milestone",
  entities: ["milestone", "task", "bug"],
  members: [
    { id: "u1", name: "Alice" },
    { id: "u2", name: "Bob" },
  ],
  updateAssignee: vi.fn(),
  toastError: vi.fn(),
  canAssign: true,
  canUpdate: true,
  project: null as unknown,
  visibleTaskIds: null as string[] | null,
  relations: [] as {
    id: string;
    sourceTaskId: string;
    targetTaskId: string;
    relationType: string;
  }[],
  hit: null as Element | null,
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
vi.mock("@/components/project/toolbar/use-project-task-view", () => ({
  useProjectTaskView: () => {
    const project = m.project as { columns: { tasks: { id: string }[] }[] };
    return {
      filters: {
        filters: {},
        filteredProject: {
          ...project,
          columns: project.columns.map((column) => ({
            ...column,
            tasks: column.tasks.filter(
              (task) =>
                m.visibleTaskIds === null || m.visibleTaskIds.includes(task.id),
            ),
          })),
        },
      },
      subjects: [],
    };
  },
}));
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({ data: m.project, isSuccess: true }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: m.update }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: m.updateAssignee }),
}));
vi.mock("@/fetchers/milestone/milestones", () => ({
  updateMilestone: (...args: unknown[]) => m.updateMilestone(...args),
  setTaskMilestone: (...args: unknown[]) => m.assignment(...args),
}));
vi.mock("@/hooks/queries/milestone/use-get-project-milestones", () => ({
  useGetProjectMilestones: () => ({
    data: m.milestones,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/queries/task-relation/use-get-project-task-relations", () => ({
  default: () => ({ data: m.relations }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canAssignTasks: () => m.canAssign,
    canUpdateTasks: () => m.canUpdate,
  }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: m.members, isSuccess: true }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/store/user-preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/store/user-preferences")>()),
  useUserPreferencesStore: (
    selector: (state: {
      weekStartsOn: number;
      ganttGroupBy: string;
      ganttEntities: string[];
    }) => unknown,
  ) =>
    selector({
      weekStartsOn: 1,
      ganttGroupBy: m.groupBy,
      ganttEntities: m.entities,
    }),
}));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusLabel: (status: string) => status,
  getPriorityLabel: (priority: string) => priority,
}));
// Keeps the interpolated value so bars and hints can be told apart.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const detail = options?.title ?? options?.name ?? options?.count;
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

// jsdom has no PointerEvent; this one carries pointerType like the real one.
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
  dueDate: string | null,
  hierarchy: {
    type?: "task" | "bug" | "feature";
    featureId?: string | null;
    milestoneId?: string | null;
  } = {},
) {
  return {
    featureId: "F",
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
    userId: "u1",
    assigneeId: "u1",
    assigneeName: "Alice",
    assigneeImage: null,
  };
}

function setTasks(tasks: ReturnType<typeof task>[]) {
  m.project = {
    name: "Project",
    slug: "PROJ",
    columns: [{ id: "col", tasks }],
    plannedTasks: [],
    archivedTasks: [],
  };
}

const milestone = (
  id: string,
  extra: Partial<GanttMilestoneRecord> = {},
): GanttMilestoneRecord => ({
  id,
  featureId: "F",
  featureTitle: "Knowledge",
  title: id,
  projectId: "project",
  position: 0,
  leadId: "u1",
  status: "to-do",
  priority: "low",
  releaseId: null,
  progress: { total: 0, started: 0, completed: 0 },
  ...extra,
});
const boardTasks = () => [
  task("cart", "2026-09-01", "2026-09-03", { milestoneId: "checkout" }),
  task("loose", "2026-09-03", "2026-09-05"),
  task("orphan", "2026-09-04", "2026-09-05", { milestoneId: "gone" }),
];

function show() {
  const Component = m.component;
  return render(<Component />);
}

function lane(container: HTMLElement, key: string) {
  const element = container.querySelector<HTMLElement>(
    `[data-gantt-lane="${key}"]`,
  );
  if (!element) throw new Error(`lane ${key} not rendered`);
  return element;
}

const taskBar = (title: string) =>
  screen.getByRole("button", {
    name: new RegExp(`tasks:gantt.milestones.taskAriaLabel:${title}$`),
  });
function milestoneBar(container: HTMLElement, id: string) {
  const row = container.querySelector<HTMLElement>(
    `[data-gantt-row="milestone:${id}"]`,
  );
  if (!row) throw new Error(`no milestone bar for ${id}`);
  return within(row).getByRole("button", { name: new RegExp(` · ${id}$`) });
}
const inLane = (container: HTMLElement, key: string, title: string) =>
  within(lane(container, key)).queryAllByText(title).length > 0;

function press(target: HTMLElement) {
  fireEvent.pointerDown(target, {
    button: 0,
    clientX: 500,
    clientY: 300,
    pointerType: "mouse",
  });
}
function moveTo(dx: number, dy: number, over: Element | null) {
  m.hit = over;
  fireEvent.pointerMove(window, {
    clientX: 500 + dx,
    clientY: 300 + dy,
    buttons: 1,
  });
}
function release(dx: number, dy: number) {
  fireEvent.pointerUp(window, { clientX: 500 + dx, clientY: 300 + dy });
}
function drag(
  target: HTMLElement,
  { dx = 0, dy = 0, over = null as Element | null },
) {
  press(target);
  moveTo(dx, dy, over);
  release(dx, dy);
}

const elementFromPoint = vi.fn(() => m.hit);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 31));
  m.canAssign = true;
  m.visibleTaskIds = null;
  m.canUpdate = true;
  m.hit = null;
  m.relations = [];
  m.update.mockResolvedValue({});
  m.updateAssignee.mockResolvedValue({});
  m.assignment.mockResolvedValue({});
  m.updateMilestone.mockResolvedValue({});
  m.groupBy = "milestone";
  m.entities = ["milestone", "task", "bug"];
  m.milestones = [
    milestone("checkout", { startDate: "2026-09-01", endDate: "2026-09-10" }),
    milestone("search", { position: 1 }),
    milestone("foreign", { featureId: "other", featureTitle: "Other" }),
  ];
  setTasks(boardTasks());
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
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    writable: true,
    value: elementFromPoint,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(document, "elementFromPoint");
});

describe("Gantt milestone planning gestures", () => {
  it("shows undated milestone lanes, task membership, and No milestone last", () => {
    const { container } = show();
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-gantt-lane]"),
      ).map((element) => element.dataset.ganttLane),
    ).toEqual([
      "milestone:checkout",
      "milestone:search",
      "milestone:foreign",
      "milestone:gone",
      "no-milestone",
    ]);
    expect(inLane(container, "milestone:checkout", "cart")).toBe(true);
    expect(inLane(container, "no-milestone", "loose")).toBe(true);
  });
  it("moves a Task to a milestone in its Feature without changing its Feature", () => {
    const { container } = show();
    drag(taskBar("cart"), {
      dy: 60,
      over: lane(container, "milestone:search"),
    });
    expect(m.assignment).toHaveBeenCalledWith("cart", "search");
    expect(m.update).not.toHaveBeenCalled();
    expect(inLane(container, "milestone:search", "cart")).toBe(true);
  });
  it("clears milestone membership while preserving the Feature", () => {
    const { container } = show();
    drag(taskBar("cart"), { dy: 120, over: lane(container, "no-milestone") });
    expect(m.assignment).toHaveBeenCalledWith("cart", null);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects another Feature's milestone without implicit Feature reassignment", () => {
    const { container } = show();
    const foreign = lane(container, "milestone:foreign");
    press(taskBar("cart"));
    moveTo(0, 60, foreign);
    expect(foreign).not.toHaveAttribute("data-drop-target");
    expect(
      screen.getByText("tasks:gantt.milestones.cannotMove:Other · foreign"),
    ).toBeInTheDocument();
    release(0, 60);
    expect(m.assignment).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("retains a task with unresolved metadata and rejects that drop target", () => {
    const { container } = show();
    drag(taskBar("cart"), { dy: 60, over: lane(container, "milestone:gone") });
    expect(inLane(container, "milestone:gone", "orphan")).toBe(true);
    expect(m.assignment).not.toHaveBeenCalled();
  });
  it("saves task dates before membership and keeps assignee and Feature", async () => {
    const { container } = show();
    drag(taskBar("cart"), {
      dx: 88,
      dy: 60,
      over: lane(container, "milestone:search"),
    });
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cart",
        userId: "u1",
        featureId: "F",
        startDate: new Date(2026, 8, 3).toISOString(),
        dueDate: new Date(2026, 8, 5).toISOString(),
      }),
    );
    await waitFor(() =>
      expect(m.assignment).toHaveBeenCalledWith("cart", "search"),
    );
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(
      m.assignment.mock.invocationCallOrder[0],
    );
  });
  it("rolls back a failed milestone assignment and keeps the task visible", async () => {
    m.assignment.mockRejectedValue(new Error("offline"));
    const { container } = show();
    drag(taskBar("cart"), {
      dy: 60,
      over: lane(container, "milestone:search"),
    });
    await waitFor(() => expect(m.toastError).toHaveBeenCalledWith("offline"));
    await waitFor(() =>
      expect(inLane(container, "milestone:checkout", "cart")).toBe(true),
    );
  });
  it("moves only a milestone's explicit dates without touching linked work", () => {
    const { container } = show();
    drag(milestoneBar(container, "checkout"), { dx: 88 });
    expect(m.updateMilestone).toHaveBeenCalledWith("checkout", {
      startDate: "2026-09-03",
      endDate: "2026-09-12",
    });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.assignment).not.toHaveBeenCalled();
  });
  it("does not enable lane reassignment without task update permission", () => {
    m.canUpdate = false;
    const { container } = show();
    drag(
      screen.getByRole("button", { name: "tasks:gantt.taskAriaLabel:cart" }),
      { dy: 60, over: lane(container, "milestone:search") },
    );
    expect(m.assignment).not.toHaveBeenCalled();
  });
  it("keeps an undated-only milestone visible without fabricating a date bar", () => {
    m.milestones = [milestone("undated")];
    setTasks([]);
    const { container } = show();
    expect(lane(container, "milestone:undated")).toBeInTheDocument();
    expect(container.querySelector("[data-gantt-bar]")).toBeNull();
  });
  it("changes only a milestone's lead when dropped into another assignee lane", () => {
    m.groupBy = "assignee";
    const { container } = show();
    const bar = milestoneBar(container, "checkout");
    expect(bar.closest("[data-gantt-lane-header]")).toBeInTheDocument();
    drag(bar, {
      dy: 60,
      over: lane(container, "member:u2"),
    });
    expect(m.updateMilestone).toHaveBeenCalledWith("checkout", {
      leadId: "u2",
    });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.assignment).not.toHaveBeenCalled();
  });
  it("places milestone bars in the lead header while leaf work stays below", () => {
    m.groupBy = "assignee";
    const { container } = show();
    const alice = lane(container, "member:u1");
    const header = alice.querySelector("[data-gantt-lane-header]");
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent("Alice");
    expect(header).toContainElement(milestoneBar(container, "checkout"));
    expect(
      alice.querySelectorAll('[data-gantt-row="milestone:checkout"]'),
    ).toHaveLength(1);
    const cart = alice.querySelector<HTMLElement>('[data-gantt-row="cart"]');
    expect(cart).toBeInTheDocument();
    expect(header).not.toContainElement(cart);
    expect(
      Array.from(alice.querySelectorAll("[data-gantt-row]")).filter(
        (row) => !row.closest("[data-gantt-lane-header]"),
      ),
    ).toHaveLength(3);
  });
  it("keeps header milestones visible when the lead's leaf rows collapse", () => {
    m.groupBy = "assignee";
    const { container } = show();
    const alice = lane(container, "member:u1");
    const toggle = alice.querySelector<HTMLButtonElement>(
      "[data-gantt-lane-header] button[aria-expanded]",
    );
    if (!toggle) throw new Error("missing lead lane toggle");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(milestoneBar(container, "checkout")).toBeInTheDocument();
    expect(alice.querySelector('[data-gantt-row="cart"]')).toBeNull();
    expect(alice.querySelector('[data-gantt-row="loose"]')).toBeNull();
    fireEvent.click(toggle);
    expect(alice.querySelector('[data-gantt-row="cart"]')).toBeInTheDocument();
  });
  it("saves a header milestone's dates and lead without editing linked work", () => {
    m.groupBy = "assignee";
    const { container } = show();
    const bar = milestoneBar(container, "checkout");
    expect(bar.closest("[data-gantt-lane-header]")).toBeInTheDocument();
    drag(bar, {
      dx: 88,
      dy: 60,
      over: lane(container, "member:u2"),
    });
    expect(m.updateMilestone).toHaveBeenCalledWith("checkout", {
      leadId: "u2",
      startDate: "2026-09-03",
      endDate: "2026-09-12",
    });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.assignment).not.toHaveBeenCalled();
  });
  it("resizes only a milestone and keeps linked work dates", () => {
    const { container } = show();
    const row = container.querySelector<HTMLElement>(
      '[data-gantt-row="milestone:checkout"]',
    );
    if (!row) throw new Error("missing milestone row");
    const handle = within(row).getByRole("button", {
      name: "tasks:gantt.resizeDue",
    });
    drag(handle, { dx: 88 });
    expect(m.updateMilestone).toHaveBeenCalledWith("checkout", {
      startDate: "2026-09-01",
      endDate: "2026-09-12",
    });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("links Bugs using the same ownership rules as Tasks", () => {
    setTasks(
      boardTasks().map((item) =>
        item.id === "cart" ? { ...item, type: "bug" as const } : item,
      ),
    );
    const { container } = show();
    drag(taskBar("cart"), {
      dy: 60,
      over: lane(container, "milestone:search"),
    });
    expect(m.assignment).toHaveBeenCalledWith("cart", "search");
  });
  it("keeps grouping metadata when milestone bars are hidden by the entity selector", () => {
    m.entities = ["task", "bug"];
    const { container } = show();
    expect(lane(container, "milestone:checkout")).toHaveTextContent(
      "Knowledge · checkout",
    );
    expect(container.querySelector('[data-gantt-bar="milestone"]')).toBeNull();
    expect(taskBar("cart")).toBeInTheDocument();
  });
  it("filters leaf rows without hiding milestones or changing their progress", () => {
    m.visibleTaskIds = ["loose"];
    const { container } = show();
    expect(milestoneBar(container, "checkout")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /taskAriaLabel:cart$/ }),
    ).toBeNull();
    expect(taskBar("loose")).toBeInTheDocument();
    expect(lane(container, "milestone:checkout")).toHaveTextContent(
      "Knowledge · checkout",
    );
  });
});
