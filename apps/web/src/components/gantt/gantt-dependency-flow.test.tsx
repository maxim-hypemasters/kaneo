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
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canAssignTasks: () => true }),
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
const isoDay = (month: number, day: number) =>
  new Date(2026, month - 1, day).toISOString();

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

function resizeEndBy(handle: HTMLElement, dx: number) {
  fireEvent.pointerDown(handle, { button: 0, clientX: 500, clientY: 300 });
  fireEvent.pointerMove(window, { clientX: 500 + dx, clientY: 300 });
  fireEvent.pointerUp(window, { clientX: 500 + dx, clientY: 300 });
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

  it("asks before breaking a dependency and can move the related tasks", async () => {
    show();

    dragBy(bar("Design"), 88);

    // Nothing is saved while the question is open.
    expect(m.update).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText("tasks:gantt.dependencies.title:1"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Build")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:1",
      }),
    );

    // Build waits for Design's save, so it never moves on its own.
    expect(m.update).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: "Design",
        startDate: isoDay(9, 3),
        dueDate: isoDay(9, 5),
      }),
    );
    // Build keeps its three days and starts the day Design now ends.
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "Build",
        startDate: isoDay(9, 5),
        dueDate: isoDay(9, 7),
      }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("can keep just this change, leaving the dependency broken", () => {
    show();

    dragBy(bar("Design"), 88);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:gantt.dependencies.moveOnly" }),
    );

    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "Design", startDate: isoDay(9, 3) }),
    );
    expect(
      screen
        .getByTestId("gantt-dependency-lines")
        .querySelector("path[data-broken]"),
    ).not.toBeNull();
  });

  it("undoes the change when cancelled", () => {
    show();

    const datesShown = (text: string) =>
      screen.queryAllByText(text, { exact: false }).length;
    // Build already shows Sep 3 - Sep 5; while asking, Design is previewed
    // at its new dates too.
    dragBy(bar("Design"), 88);
    expect(datesShown("Sep 3, 2026 - Sep 5, 2026")).toBe(2);
    expect(datesShown("Sep 1, 2026 - Sep 3, 2026")).toBe(0);

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );

    expect(m.update).not.toHaveBeenCalled();
    expect(datesShown("Sep 3, 2026 - Sep 5, 2026")).toBe(1);
    expect(datesShown("Sep 1, 2026 - Sep 3, 2026")).toBe(1);
  });

  it("saves moves that keep every dependency without asking", () => {
    show();

    dragBy(bar("Build"), 88);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "Build", startDate: isoDay(9, 5) }),
    );
  });

  it("moves a whole chain along, as far as each task needs", async () => {
    m.relations = [blocks("Design", "Build"), blocks("Build", "Ship")];
    show();

    // Three days: Build ends Sep 8, a day after Ship starts.
    dragBy(bar("Design"), 132);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:2",
      }),
    );

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(3));
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "Build",
        startDate: isoDay(9, 6),
        dueDate: isoDay(9, 8),
      }),
    );
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "Ship",
        startDate: isoDay(9, 8),
        dueDate: isoDay(9, 9),
      }),
    );
  });

  it("only shifts the dates a moved-along task already has", async () => {
    setTasks(
      task("Design", "2026-09-01", "2026-09-03"),
      task("Build", null, "2026-09-03"),
    );
    show();

    dragBy(bar("Design"), 88);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:1",
      }),
    );

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "Build",
        startDate: null,
        dueDate: isoDay(9, 5),
      }),
    );
  });

  it("leaves the related tasks alone when the moved one fails to save", async () => {
    m.update.mockImplementation((saved: { id: string }) =>
      saved.id === "Design"
        ? Promise.reject(new Error("Server said no"))
        : Promise.resolve({}),
    );
    show();

    dragBy(bar("Design"), 88);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:1",
      }),
    );

    await waitFor(() => expect(m.toastError).toHaveBeenCalledTimes(1));
    expect(m.toastError).toHaveBeenCalledWith("Server said no");
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "Design" }),
    );
  });

  it("only offers keeping or undoing a change the loop would undo", () => {
    m.relations = [
      blocks("Design", "Build"),
      blocks("Build", "Ship"),
      blocks("Ship", "Design"),
    ];
    setTasks(
      task("Design", "2026-09-01", "2026-09-03"),
      task("Build", "2026-09-03", "2026-09-05"),
      task("Ship", "2026-09-05", "2026-09-08"),
    );
    show();

    // Design ends two days later but still starts Sep 1: pushing Build and
    // Ship along would make Ship end even further past Design's start.
    resizeEndBy(
      screen.getAllByRole("button", { name: "tasks:gantt.resizeDue" })[0],
      88,
    );

    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText("tasks:gantt.dependencies.cycleDescription"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", {
        name: /tasks:gantt.dependencies.moveRelated/,
      }),
    ).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "tasks:gantt.dependencies.moveOnly",
      }),
    );
    expect(m.update).toHaveBeenCalledTimes(1);
  });

  it("keeps asking when someone else's change makes the conflict look old", () => {
    const view = show();
    dragBy(bar("Design"), 88);

    // Build now starts before Design's saved end, so against the latest
    // dates the dependency was already broken; the user still hasn't
    // answered for theirs.
    setTasks(
      task("Design", "2026-09-01", "2026-09-03"),
      task("Build", "2026-09-02", "2026-09-04"),
      task("Ship", "2026-09-07", "2026-09-08"),
    );
    view.rerender(<m.component />);

    expect(m.update).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole("alertdialog")).getByText(
        "tasks:gantt.dependencies.title:1",
      ),
    ).toBeInTheDocument();
  });

  it("keeps a reassignment made while it asks", () => {
    const view = show();
    dragBy(bar("Design"), 88);

    setTasks(
      {
        ...task("Design", "2026-09-01", "2026-09-03"),
        userId: "bob",
        assigneeId: "bob",
        assigneeName: "Bob",
      },
      task("Build", "2026-09-03", "2026-09-05"),
      task("Ship", "2026-09-07", "2026-09-08"),
    );
    view.rerender(<m.component />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:gantt.dependencies.moveOnly" }),
    );

    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "Design",
        startDate: isoDay(9, 3),
        userId: "bob",
      }),
    );
  });

  it("keeps a start date a related task was just given", async () => {
    setTasks(
      task("Design", "2026-09-01", "2026-09-03"),
      task("Build", null, "2026-09-03"),
    );
    show();

    // Stretch Build to Sep 3-5, which gives it a start date; the refetch
    // hasn't landed when Design is moved over it.
    resizeEndBy(
      screen.getAllByRole("button", { name: "tasks:gantt.resizeDue" })[1],
      88,
    );
    dragBy(bar("Design"), 88);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:1",
      }),
    );

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(3));
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "Build",
        startDate: isoDay(9, 5),
        dueDate: isoDay(9, 7),
      }),
    );
  });

  it("never lets a related task's queue skip ahead of its earlier save", async () => {
    let finishFirstBuildSave: (() => void) | undefined;
    m.update.mockImplementation((saved: { id: string }) => {
      if (saved.id === "Design") {
        return Promise.reject(new Error("Server said no"));
      }
      if (!finishFirstBuildSave) {
        return new Promise((resolve) => {
          finishFirstBuildSave = () => resolve({});
        });
      }
      return Promise.resolve({});
    });
    show();

    dragBy(bar("Build"), 88);
    // Design over the moved Build; its save fails while Build's is open.
    dragBy(bar("Design"), 132);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:1",
      }),
    );
    await waitFor(() => expect(m.toastError).toHaveBeenCalledTimes(1));
    dragBy(bar("Build"), 44);
    await Promise.resolve();

    const buildSaves = () =>
      m.update.mock.calls.filter(([saved]) => saved.id === "Build").length;
    expect(buildSaves()).toBe(1);
    // The moves made on top of the failed save are dropped with it, but only
    // once Build's first save has settled.
    finishFirstBuildSave?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(buildSaves()).toBe(1);
  });

  it("plans from the latest data when tasks change while it asks", async () => {
    const view = show();
    dragBy(bar("Design"), 88);

    // Someone else lengthens Build to start a day later meanwhile.
    setTasks(
      task("Design", "2026-09-01", "2026-09-03"),
      task("Build", "2026-09-04", "2026-09-07"),
      task("Ship", "2026-09-07", "2026-09-08"),
    );
    view.rerender(<m.component />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:1",
      }),
    );

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "Build",
        startDate: isoDay(9, 5),
        dueDate: isoDay(9, 8),
      }),
    );
  });

  it("saves the change once the latest data no longer breaks anything", async () => {
    const view = show();
    dragBy(bar("Design"), 88);

    setTasks(
      task("Design", "2026-09-01", "2026-09-03"),
      task("Build", "2026-09-06", "2026-09-08"),
      task("Ship", "2026-09-07", "2026-09-08"),
    );
    view.rerender(<m.component />);

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(1));
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "Design", startDate: isoDay(9, 3) }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
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

  it("keeps a feature in a dependency as a row when grouped, with its arrow and warning", () => {
    m.groupBy = "assignee";
    // Design blocks the Checkout feature but ends after it starts. Checkout's
    // one task also puts it on the Unassigned line as a slice.
    setTasks(
      task("Design", "2026-09-01", "2026-09-04"),
      task("Checkout", "2026-09-03", "2026-09-06", { type: "feature" }),
      task("Cart", "2026-09-04", "2026-09-05", { featureId: "Checkout" }),
      task("Search", "2026-09-07", "2026-09-08", { type: "feature" }),
      task("Query", "2026-09-07", "2026-09-08", { featureId: "Search" }),
    );
    m.relations = [blocks("Design", "Checkout")];
    const { container } = show();

    expect(
      container.querySelector('[data-gantt-row="Checkout"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", {
        name: "tasks:gantt.featureSliceAria:Checkout",
      }),
    ).toBeInTheDocument();
    // A feature outside any dependency still leaves the rows.
    expect(container.querySelector('[data-gantt-row="Search"]')).toBeNull();
    expect(linePaths()).toHaveLength(1);
    expect(linePaths()[0]).toHaveAttribute("data-broken");
    expect(
      screen.getByRole("button", {
        name: "tasks:gantt.taskAriaLabelGrouped:Checkout",
      }),
    ).toHaveAccessibleDescription(
      "tasks:gantt.dependencies.startsBeforeBlocker:Design",
    );
  });

  it("still plans around a feature drawn on its members' lines", async () => {
    m.groupBy = "assignee";
    // Design blocks the Checkout feature, whose one task also draws it on
    // the Unassigned line.
    setTasks(
      task("Design", "2026-09-01", "2026-09-03"),
      task("Checkout", "2026-09-03", "2026-09-06", { type: "feature" }),
      task("Cart", "2026-09-04", "2026-09-05", { featureId: "Checkout" }),
    );
    m.relations = [blocks("Design", "Checkout")];
    show();

    expect(
      screen.getByRole("button", {
        name: "tasks:gantt.featureSliceAria:Checkout",
      }),
    ).toBeInTheDocument();

    dragBy(
      screen.getByRole("button", {
        name: "tasks:gantt.taskAriaLabelGrouped:Design",
      }),
      88,
    );

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Checkout")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:1",
      }),
    );
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "Design", startDate: isoDay(9, 3) }),
    );
    // The feature keeps its four days and starts the day Design now ends.
    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "Checkout",
          startDate: isoDay(9, 5),
          dueDate: isoDay(9, 8),
        }),
      ),
    );
  });
});
