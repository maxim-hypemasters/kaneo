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
  updateAssignee: vi.fn(),
  toastError: vi.fn(),
  canAssign: true,
  groupBy: "assignee",
  project: null as unknown,
  members: [] as { id: string; name: string; image: string | null }[],
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
vi.mock("@/hooks/queries/task-relation/use-get-project-task-relations", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canAssignTasks: () => m.canAssign }),
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
    }) => unknown,
  ) => selector({ weekStartsOn: 1, ganttGroupBy: m.groupBy }),
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

const alice = { userId: "u1", name: "Alice" };
const bob = { userId: "u2", name: "Bob" };

function task(
  id: string,
  startDate: string,
  dueDate: string,
  assignee: { userId: string; name: string } | null,
) {
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
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: assignee?.userId ?? null,
    assigneeId: assignee?.userId ?? null,
    assigneeName: assignee?.name ?? null,
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

const groupedBar = (title: string) =>
  screen.getByRole("button", {
    name: `tasks:gantt.taskAriaLabelGrouped:${title}`,
  });
const flatBar = (title: string) =>
  screen.getByRole("button", { name: `tasks:gantt.taskAriaLabel:${title}` });

// The timeline opens Mon Aug 24 (a week before the earliest task's week) and
// each day column measures 44px, so dx: 88 moves a bar by two days.
const isoDay = (month: number, day: number) =>
  new Date(2026, month - 1, day).toISOString();

function press(target: HTMLElement, pointerType = "mouse") {
  fireEvent.pointerDown(target, {
    button: 0,
    clientX: 500,
    clientY: 300,
    pointerType,
  });
}
function moveTo(dx: number, dy: number, over: Element | null) {
  m.hit = over;
  // buttons: 1 — the primary button is held, as during any real drag.
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
  { dx = 0, dy = 0, over = null as Element | null, pointerType = "mouse" },
) {
  press(target, pointerType);
  moveTo(dx, dy, over);
  release(dx, dy);
}

const elementFromPoint = vi.fn(() => m.hit);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 31));
  m.canAssign = true;
  m.groupBy = "assignee";
  m.hit = null;
  m.members = [
    { id: "u1", name: "Alice", image: null },
    { id: "u2", name: "Bob", image: null },
  ];
  m.update.mockResolvedValue({});
  m.updateAssignee.mockResolvedValue({});
  setTasks([
    task("A1", "2026-09-01", "2026-09-03", alice),
    task("B1", "2026-09-02", "2026-09-04", bob),
  ]);
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

describe("Gantt drag to reassign", () => {
  it("reassigns through the assignee endpoint when only the lane changes", () => {
    const { container } = show();
    const bobLane = lane(container, "member:u2");

    press(groupedBar("A1"));
    moveTo(0, 60, bobLane);
    expect(bobLane).toHaveAttribute("data-drop-target");
    expect(screen.getByText("tasks:gantt.assignTo:Bob")).toBeInTheDocument();
    release(0, 60);

    expect(m.updateAssignee).toHaveBeenCalledTimes(1);
    expect(m.updateAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ id: "A1", userId: "u2" }),
    );
    expect(m.update).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
    expect(bobLane).not.toHaveAttribute("data-drop-target");
    expect(screen.queryByText("tasks:gantt.assignTo:Bob")).toBeNull();
  });

  it("saves new dates and the new assignee in one request", () => {
    const { container } = show();

    drag(groupedBar("A1"), {
      dx: 88,
      dy: 60,
      over: lane(container, "member:u2"),
    });

    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "A1",
        userId: "u2",
        startDate: isoDay(9, 3),
        dueDate: isoDay(9, 5),
      }),
    );
    expect(m.updateAssignee).not.toHaveBeenCalled();
  });

  it("keeps the assignee when dropped back on its own lane", () => {
    const { container } = show();
    const aliceLane = lane(container, "member:u1");

    drag(groupedBar("A1"), { dx: 0, dy: 60, over: aliceLane });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();

    drag(groupedBar("A1"), { dx: 88, dy: 60, over: aliceLane });
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "A1", userId: "u1" }),
    );
    expect(m.updateAssignee).not.toHaveBeenCalled();
  });

  it("unassigns when dropped on the Unassigned lane", () => {
    const { container } = show();

    press(groupedBar("A1"));
    moveTo(0, 120, lane(container, "unassigned"));
    expect(screen.getByText("tasks:gantt.unassign")).toBeInTheDocument();
    release(0, 120);

    expect(m.updateAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ id: "A1", userId: null }),
    );
  });

  it("reassigns onto a collapsed lane through its header", () => {
    const { container } = show();
    const bobLane = lane(container, "member:u2");
    const toggle = within(bobLane).getByRole("button", { name: /^Bob/ });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    drag(groupedBar("A1"), { dx: 0, dy: 60, over: toggle });

    expect(m.updateAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ id: "A1", userId: "u2" }),
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("refuses lanes of people who can no longer be assigned", () => {
    setTasks([
      task("A1", "2026-09-01", "2026-09-03", alice),
      task("C1", "2026-09-02", "2026-09-04", { userId: "u9", name: "Former" }),
    ]);
    const { container } = show();
    const formerLane = lane(container, "member:u9");

    press(groupedBar("A1"));
    moveTo(0, 60, formerLane);
    expect(
      screen.getByText("tasks:gantt.cannotAssign:Former"),
    ).toBeInTheDocument();
    expect(formerLane).not.toHaveAttribute("data-drop-target");
    release(0, 60);

    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("ignores drops outside any lane, such as the date header", () => {
    show();

    drag(groupedBar("A1"), {
      dx: 0,
      dy: -60,
      over: screen.getByText("tasks:gantt.taskHeader"),
    });

    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateAssignee).not.toHaveBeenCalled();
  });

  it("cancels the drag with Escape", () => {
    const { container } = show();
    const bobLane = lane(container, "member:u2");

    press(groupedBar("A1"));
    moveTo(0, 60, bobLane);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(bobLane).not.toHaveAttribute("data-drop-target");
    release(0, 60);

    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("cancels the drag on pointercancel", () => {
    const { container } = show();

    press(groupedBar("A1"));
    moveTo(0, 60, lane(container, "member:u2"));
    fireEvent.pointerCancel(window);

    expect(container.querySelector("[data-drop-target]")).toBeNull();
    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("shows the move right away and keeps one row once the refetch lands", () => {
    m.updateAssignee.mockReturnValue(new Promise(() => {}));
    const { container, rerender } = show();

    drag(groupedBar("A1"), {
      dx: 0,
      dy: 60,
      over: lane(container, "member:u2"),
    });

    expect(
      within(lane(container, "member:u2")).getAllByText("A1").length,
    ).toBeGreaterThan(0);
    expect(within(lane(container, "member:u1")).queryAllByText("A1")).toEqual(
      [],
    );

    setTasks([
      task("A1", "2026-09-01", "2026-09-03", bob),
      task("B1", "2026-09-02", "2026-09-04", bob),
    ]);
    const Component = m.component;
    rerender(<Component />);

    expect(
      screen.getAllByRole("button", {
        name: "tasks:gantt.taskAriaLabelGrouped:A1",
      }),
    ).toHaveLength(1);
    expect(
      within(lane(container, "member:u2")).getAllByText("A1").length,
    ).toBeGreaterThan(0);
  });

  it("puts the task back and reports the error when reassignment fails", async () => {
    m.updateAssignee.mockRejectedValue(
      new Error("Assignee does not have access to this project"),
    );
    const { container } = show();

    drag(groupedBar("A1"), {
      dx: 0,
      dy: 60,
      over: lane(container, "member:u2"),
    });

    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(
        "Assignee does not have access to this project",
      ),
    );
    await waitFor(() =>
      expect(
        within(lane(container, "member:u1")).getAllByText("A1").length,
      ).toBeGreaterThan(0),
    );
    expect(within(lane(container, "member:u2")).queryAllByText("A1")).toEqual(
      [],
    );
  });

  it("waits for an in-flight save before sending the next drag of the same task", async () => {
    let finishFirst: (value: unknown) => void = () => {};
    m.updateAssignee.mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirst = resolve;
      }),
    );
    const { container } = show();

    drag(groupedBar("A1"), {
      dx: 0,
      dy: 60,
      over: lane(container, "member:u2"),
    });
    // A1 now shows in Bob's lane; drag it straight back to Alice.
    drag(groupedBar("A1"), {
      dx: 0,
      dy: -60,
      over: lane(container, "member:u1"),
    });
    expect(m.updateAssignee).toHaveBeenCalledTimes(1);

    finishFirst({});
    await waitFor(() => expect(m.updateAssignee).toHaveBeenCalledTimes(2));
    expect(m.updateAssignee).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "A1", userId: "u1" }),
    );
  });

  it("drops a dependent drag when the save it builds on fails", async () => {
    let failFirst: (error: Error) => void = () => {};
    m.updateAssignee.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failFirst = reject;
      }),
    );
    const { container } = show();

    drag(groupedBar("A1"), {
      dx: 0,
      dy: 60,
      over: lane(container, "member:u2"),
    });
    // Rescheduled inside Bob's lane while the reassignment is still saving.
    drag(groupedBar("A1"), {
      dx: 88,
      dy: 0,
      over: lane(container, "member:u2"),
    });

    failFirst(new Error("Bob can't be assigned"));

    await waitFor(() =>
      expect(
        within(lane(container, "member:u1")).getAllByText("A1").length,
      ).toBeGreaterThan(0),
    );
    expect(m.update).not.toHaveBeenCalled();
    expect(m.toastError).toHaveBeenCalledTimes(1);
    expect(m.toastError).toHaveBeenCalledWith("Bob can't be assigned");
  });

  it("keeps a queued edit until its own save has gone out", async () => {
    let finishFirst: (value: unknown) => void = () => {};
    m.updateAssignee
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
      )
      .mockReturnValueOnce(new Promise(() => {}));
    const { container, rerender } = show();
    const Component = m.component;

    drag(groupedBar("A1"), {
      dx: 0,
      dy: 60,
      over: lane(container, "member:u2"),
    });
    drag(groupedBar("A1"), {
      dx: 0,
      dy: -60,
      over: lane(container, "member:u1"),
    });

    // Unrelated refetch while the first save is in flight: the server still
    // has A1 on Alice, which only coincidentally matches the queued edit.
    setTasks([
      task("A1", "2026-09-01", "2026-09-03", alice),
      task("B1", "2026-09-02", "2026-09-04", bob),
    ]);
    rerender(<Component />);

    finishFirst({});
    await waitFor(() => expect(m.updateAssignee).toHaveBeenCalledTimes(2));
    // The first save lands (A1 on Bob) before the second one does.
    setTasks([
      task("A1", "2026-09-01", "2026-09-03", bob),
      task("B1", "2026-09-02", "2026-09-04", bob),
    ]);
    rerender(<Component />);

    expect(
      within(lane(container, "member:u1")).getAllByText("A1").length,
    ).toBeGreaterThan(0);
    expect(within(lane(container, "member:u2")).queryAllByText("A1")).toEqual(
      [],
    );
  });

  it("treats a press that only scrolls the timeline as a click", () => {
    const { container } = show();
    const scroller = container.querySelector<HTMLElement>(
      "[data-gantt-scroll-container]",
    );
    if (!scroller) throw new Error("scroll container not rendered");

    press(groupedBar("A1"));
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 60,
    });
    m.hit = lane(container, "member:u2");
    fireEvent.scroll(scroller);
    release(0, 0);

    expect(m.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { taskId: "A1" } }),
    );
    expect(m.updateAssignee).not.toHaveBeenCalled();
  });

  it("drops a gesture whose release was lost instead of committing it later", () => {
    const { container } = show();
    const bobLane = lane(container, "member:u2");

    press(groupedBar("A1"));
    moveTo(0, 60, bobLane);
    expect(bobLane).toHaveAttribute("data-drop-target");
    // The button is no longer held: the release went somewhere else.
    fireEvent.pointerMove(window, { clientX: 500, clientY: 360, buttons: 0 });
    expect(bobLane).not.toHaveAttribute("data-drop-target");
    release(0, 60);

    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("cancels the drag when a context menu opens", () => {
    const { container } = show();

    press(groupedBar("A1"));
    moveTo(0, 60, lane(container, "member:u2"));
    fireEvent.contextMenu(window);
    release(0, 60);

    expect(container.querySelector("[data-drop-target]")).toBeNull();
    expect(m.updateAssignee).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("only reschedules when the user can't assign tasks", () => {
    m.canAssign = false;
    const { container } = show();

    drag(flatBar("A1"), { dx: 0, dy: 60, over: lane(container, "member:u2") });
    expect(m.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { taskId: "A1" } }),
    );

    drag(flatBar("A1"), { dx: 88, dy: 60, over: lane(container, "member:u2") });
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "A1", userId: "u1" }),
    );
    expect(elementFromPoint).not.toHaveBeenCalled();
    expect(m.updateAssignee).not.toHaveBeenCalled();
  });

  it("never targets lanes from a touch drag", () => {
    const { container } = show();

    drag(groupedBar("A1"), {
      dx: 0,
      dy: 60,
      over: lane(container, "member:u2"),
      pointerType: "touch",
    });

    expect(elementFromPoint).not.toHaveBeenCalled();
    expect(m.updateAssignee).not.toHaveBeenCalled();
  });

  it("leaves the ungrouped timeline as it was", () => {
    m.groupBy = "none";
    const { container } = show();
    expect(container.querySelector("[data-gantt-lane]")).toBeNull();

    drag(flatBar("A1"), { dx: 0, dy: 60 });
    expect(m.navigate).toHaveBeenCalledTimes(1);

    drag(flatBar("A1"), { dx: 88, dy: 60 });
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "A1",
        userId: "u1",
        startDate: isoDay(9, 3),
        dueDate: isoDay(9, 5),
      }),
    );
    expect(elementFromPoint).not.toHaveBeenCalled();
  });
});
