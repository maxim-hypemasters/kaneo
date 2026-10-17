import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  updateFeature: vi.fn(),
  updateAssignee: vi.fn(),
  toastError: vi.fn(),
  canAssign: true,
  canUpdate: true,
  project: null as unknown,
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
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({ data: m.project, isSuccess: true }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: m.update }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: m.updateAssignee }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({ mutateAsync: m.updateFeature }),
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
  ) => selector({ weekStartsOn: 1, ganttGroupBy: "feature" }),
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

// The Checkout feature with Cart in it; Loose in no feature; the Search
// feature, undated with nothing in it; and Orphan, in a feature that isn't
// on the board.
const boardTasks = () => [
  task("checkout", "2026-09-01", "2026-09-10", { type: "feature" }),
  task("cart", "2026-09-01", "2026-09-03", { featureId: "checkout" }),
  task("loose", "2026-09-03", "2026-09-05"),
  task("orphan", "2026-09-04", "2026-09-05", { featureId: "gone" }),
  task("search", null, null, { type: "feature" }),
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
    name: `tasks:gantt.featureLanes.taskAriaLabel:${title}`,
  });
// The feature's own bar in its lane header (found by title, whatever its
// label says).
function featureBar(container: HTMLElement, featureId: string) {
  const row = container.querySelector<HTMLElement>(
    `[data-gantt-lane="feature:${featureId}"] [data-gantt-row="${featureId}"]`,
  );
  if (!row) throw new Error(`no header bar for ${featureId}`);
  return within(row).getByRole("button", {
    name: new RegExp(`:${featureId}$`),
  });
}
const inLane = (container: HTMLElement, key: string, title: string) =>
  within(lane(container, key)).queryAllByText(title).length > 0;
// The grid columns a task's bar is drawn on, i.e. its dates.
const barColumns = (title: string) =>
  taskBar(title).closest<HTMLElement>("[data-gantt-bar]")?.style.gridColumn;
// Loose starts the day Cart ends, so moving Cart later breaks this.
const cartBlocksLoose = {
  id: "cart-blocks-loose",
  sourceTaskId: "cart",
  targetTaskId: "loose",
  relationType: "blocks",
};
// A feature move that stays open until the test fails it.
function holdFeatureMove() {
  let fail: (reason: unknown) => void = () => {};
  m.updateFeature.mockReturnValue(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  return (reason: unknown) => fail(reason);
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The timeline opens Mon Aug 24 (a week before the earliest task's week) and
// each day column measures 44px, so dx: 88 moves a bar by two days.
const isoDay = (month: number, day: number) =>
  new Date(2026, month - 1, day).toISOString();

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
  m.canUpdate = true;
  m.hit = null;
  m.relations = [];
  m.update.mockResolvedValue({});
  m.updateAssignee.mockResolvedValue({});
  m.updateFeature.mockResolvedValue({});
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

describe("Gantt drag between feature lanes", () => {
  it("lays out a lane per feature, with No feature last", () => {
    const { container } = show();

    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-gantt-lane]"),
      ).map((element) => element.dataset.ganttLane),
    ).toEqual([
      "feature:checkout",
      "feature:gone",
      "feature:search",
      "no-feature",
    ]);
    expect(inLane(container, "feature:checkout", "cart")).toBe(true);
    expect(inLane(container, "no-feature", "loose")).toBe(true);
  });

  it("moves a task with only the feature request when only the lane changes", () => {
    const { container } = show();
    const searchLane = lane(container, "feature:search");

    press(taskBar("cart"));
    moveTo(0, 60, searchLane);
    expect(searchLane).toHaveAttribute("data-drop-target");
    expect(
      screen.getByText("tasks:gantt.featureLanes.moveTo:search"),
    ).toBeInTheDocument();
    release(0, 60);

    expect(m.updateFeature).toHaveBeenCalledTimes(1);
    expect(m.updateFeature).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: "cart", featureId: "checkout" }),
      featureId: "search",
    });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
    expect(searchLane).not.toHaveAttribute("data-drop-target");
  });

  it("saves new dates first, then moves the task, keeping its assignee", async () => {
    const { container } = show();

    drag(taskBar("cart"), {
      dx: 88,
      dy: 60,
      over: lane(container, "feature:search"),
    });

    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cart",
        userId: "u1",
        startDate: isoDay(9, 3),
        dueDate: isoDay(9, 5),
      }),
    );
    await waitFor(() =>
      expect(m.updateFeature).toHaveBeenCalledWith({
        task: expect.objectContaining({ id: "cart" }),
        featureId: "search",
      }),
    );
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(
      m.updateFeature.mock.invocationCallOrder[0] ?? 0,
    );
    expect(m.updateAssignee).not.toHaveBeenCalled();
  });

  it("takes a task out of its feature on the No feature lane", () => {
    const { container } = show();

    press(taskBar("cart"));
    moveTo(0, 120, lane(container, "no-feature"));
    expect(
      screen.getByText("tasks:gantt.featureLanes.remove"),
    ).toBeInTheDocument();
    release(0, 120);

    expect(m.updateFeature).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: "cart" }),
      featureId: null,
    });
  });

  it("moves a task with no feature into one", () => {
    const { container } = show();

    drag(taskBar("loose"), {
      dx: 0,
      dy: -60,
      over: lane(container, "feature:checkout"),
    });

    expect(m.updateFeature).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: "loose" }),
      featureId: "checkout",
    });
  });

  it("sends nothing when dropped back on its own lane", () => {
    const { container } = show();

    drag(taskBar("cart"), {
      dx: 0,
      dy: 60,
      over: lane(container, "feature:checkout"),
    });

    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateFeature).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("refuses the lane of a feature that isn't on the board", () => {
    const { container } = show();
    const goneLane = lane(container, "feature:gone");

    press(taskBar("cart"));
    moveTo(0, 60, goneLane);
    expect(
      screen.getByText(
        "tasks:gantt.featureLanes.cannotMove:tasks:features.unknown",
      ),
    ).toBeInTheDocument();
    expect(goneLane).not.toHaveAttribute("data-drop-target");
    release(0, 60);

    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateFeature).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("shows the move at once, and puts the task back when it fails", async () => {
    const failFeatureMove = holdFeatureMove();
    const { container } = show();

    drag(taskBar("cart"), {
      dx: 0,
      dy: 60,
      over: lane(container, "feature:search"),
    });
    expect(inLane(container, "feature:search", "cart")).toBe(true);
    expect(inLane(container, "feature:checkout", "cart")).toBe(false);

    failFeatureMove("offline");

    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(
        "tasks:gantt.featureLanes.moveError",
      ),
    );
    await waitFor(() =>
      expect(inLane(container, "feature:checkout", "cart")).toBe(true),
    );
    expect(inLane(container, "feature:search", "cart")).toBe(false);
  });

  it("keeps the saved dates when only the feature move fails", async () => {
    const failFeatureMove = holdFeatureMove();
    const { container, rerender } = show();
    expect(barColumns("cart")).toBe("9 / 12");

    drag(taskBar("cart"), {
      dx: 88,
      dy: 60,
      over: lane(container, "feature:search"),
    });
    expect(inLane(container, "feature:search", "cart")).toBe(true);
    expect(barColumns("cart")).toBe("11 / 14");
    await waitFor(() => expect(m.updateFeature).toHaveBeenCalledTimes(1));

    failFeatureMove("offline");

    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(
        "tasks:gantt.featureLanes.moveError",
      ),
    );
    await waitFor(() =>
      expect(inLane(container, "feature:checkout", "cart")).toBe(true),
    );
    // Back in its feature, but still on the dates that did save.
    expect(barColumns("cart")).toBe("11 / 14");

    // The next refetch replaces it with whatever the server holds.
    setTasks(
      boardTasks().map((item) =>
        item.id === "cart"
          ? { ...item, startDate: "2026-09-04", dueDate: "2026-09-06" }
          : item,
      ),
    );
    const Component = m.component;
    rerender(<Component />);
    expect(barColumns("cart")).toBe("12 / 15");
  });

  it("reports a failed date change and never sends the feature move", async () => {
    m.update.mockRejectedValue("offline");
    const { container } = show();

    drag(taskBar("cart"), {
      dx: 88,
      dy: 60,
      over: lane(container, "feature:search"),
    });

    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith("tasks:gantt.updateDatesError"),
    );
    await waitFor(() =>
      expect(inLane(container, "feature:checkout", "cart")).toBe(true),
    );
    expect(barColumns("cart")).toBe("9 / 12");
    expect(m.toastError).toHaveBeenCalledTimes(1);
    expect(m.updateFeature).not.toHaveBeenCalled();
  });

  it("moves the related tasks once the dates save, even if the feature move fails", async () => {
    m.relations = [cartBlocksLoose];
    const failFeatureMove = holdFeatureMove();
    const { container } = show();

    drag(taskBar("cart"), {
      dx: 88,
      dy: 60,
      over: lane(container, "feature:search"),
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:1",
      }),
    );

    // Loose follows Cart's saved dates without waiting for its feature move.
    await waitFor(() => expect(m.updateFeature).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "loose",
          startDate: isoDay(9, 5),
          dueDate: isoDay(9, 7),
        }),
      ),
    );

    failFeatureMove(new Error("Feature not found"));

    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith("Feature not found"),
    );
    expect(m.toastError).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledTimes(2);
  });

  it("still saves a later reschedule queued behind a failed feature move", async () => {
    const failFeatureMove = holdFeatureMove();
    const { container } = show();

    drag(taskBar("cart"), {
      dx: 88,
      dy: 60,
      over: lane(container, "feature:search"),
    });
    await waitFor(() => expect(m.updateFeature).toHaveBeenCalledTimes(1));
    // Two more days while the feature move is open: it waits its turn.
    drag(taskBar("cart"), { dx: 88 });
    await flush();
    expect(m.update).toHaveBeenCalledTimes(1);

    failFeatureMove("offline");

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "cart",
        startDate: isoDay(9, 5),
        dueDate: isoDay(9, 7),
      }),
    );
    expect(m.updateFeature).toHaveBeenCalledTimes(1);
    expect(m.toastError).toHaveBeenCalledTimes(1);
    expect(m.toastError).toHaveBeenCalledWith(
      "tasks:gantt.featureLanes.moveError",
    );
    // On its newest dates, back in the feature it is still in.
    await waitFor(() =>
      expect(inLane(container, "feature:checkout", "cart")).toBe(true),
    );
    expect(barColumns("cart")).toBe("13 / 16");
  });

  it("only reschedules without permission to update tasks", () => {
    m.canUpdate = false;
    const { container } = show();
    const bar = screen.getByRole("button", {
      name: "tasks:gantt.taskAriaLabel:cart",
    });

    drag(bar, { dx: 0, dy: 60, over: lane(container, "feature:search") });
    expect(m.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { taskId: "cart" } }),
    );

    drag(bar, { dx: 88, dy: 60, over: lane(container, "feature:search") });
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cart", startDate: isoDay(9, 3) }),
    );
    expect(elementFromPoint).not.toHaveBeenCalled();
    expect(m.updateFeature).not.toHaveBeenCalled();
  });

  it("moves tasks between features without permission to assign them", () => {
    m.canAssign = false;
    const { container } = show();

    drag(taskBar("cart"), {
      dx: 0,
      dy: 60,
      over: lane(container, "feature:search"),
    });

    expect(m.updateFeature).toHaveBeenCalledTimes(1);
  });

  it("reschedules a feature from the bar in its lane header", () => {
    const { container } = show();

    drag(featureBar(container, "checkout"), { dx: 88 });

    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "checkout",
        startDate: isoDay(9, 3),
        dueDate: isoDay(9, 12),
      }),
    );
    expect(m.updateFeature).not.toHaveBeenCalled();
  });

  it("opens the feature from its header bar, which never joins another lane", () => {
    const { container } = show();

    drag(featureBar(container, "checkout"), {
      dx: 0,
      dy: 120,
      over: lane(container, "no-feature"),
    });

    expect(m.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { taskId: "checkout" } }),
    );
    expect(elementFromPoint).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateFeature).not.toHaveBeenCalled();
  });

  it("keeps a feature move held by a dependency question, and saves it with the dates", async () => {
    m.relations = [cartBlocksLoose];
    const { container } = show();

    drag(taskBar("cart"), {
      dx: 88,
      dy: 60,
      over: lane(container, "feature:search"),
    });

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(m.update).not.toHaveBeenCalled();
    // Shown in its new lane while the question is open.
    expect(inLane(container, "feature:search", "cart")).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "tasks:gantt.dependencies.moveOnly" }),
    );

    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cart", startDate: isoDay(9, 3) }),
    );
    await waitFor(() =>
      expect(m.updateFeature).toHaveBeenCalledWith({
        task: expect.objectContaining({ id: "cart" }),
        featureId: "search",
      }),
    );
  });

  it("keeps a feature move made by someone else while a date change is held", () => {
    m.relations = [cartBlocksLoose];
    const { rerender } = show();

    // Only the dates change.
    drag(taskBar("cart"), { dx: 88 });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Meanwhile someone moves Cart into Search.
    setTasks(
      boardTasks().map((item) =>
        item.id === "cart" ? { ...item, featureId: "search" } : item,
      ),
    );
    const Component = m.component;
    rerender(<Component />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:gantt.dependencies.moveOnly" }),
    );

    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cart", startDate: isoDay(9, 3) }),
    );
    expect(m.updateFeature).not.toHaveBeenCalled();
  });
});
