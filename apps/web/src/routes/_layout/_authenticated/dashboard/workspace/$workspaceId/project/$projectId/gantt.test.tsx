import enUS from "@i18n/en-US.json";
import {
  cleanup,
  fireEvent,
  render,
  screen,
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
import type Task from "@/types/task";
import { Route } from "./gantt";

// jsdom does not implement either of these; the component relies on both to
// center the timeline on "today".
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

const navigate = vi.fn();

// A plain mutable object rather than a per-test vi.fn() mock: the Gantt
// project selector swaps `projectId` on the same route (no remount), so
// tests that exercise that need to change what `useParams` returns between
// renders of the *same* render() call, which a fresh mockReturnValue can't
// do retroactively.
const routeParams = { workspaceId: "workspace-1", projectId: "project-1" };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    ...(options as Record<string, unknown>),
    useParams: () => routeParams,
    useSearch: () => ({ taskId: undefined }),
  }),
  useNavigate: () => navigate,
}));

const useGetTasks = vi.fn();
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: (projectId: string) => useGetTasks(projectId),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

// Mutable for the same reason as routeParams: read lazily by the mock.
const preferences = {
  weekStartsOn: 0,
  ganttGroupBy: "none",
  setViewMode: vi.fn(),
  setTaskLayout: vi.fn(),
};
vi.mock("@/store/user-preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/store/user-preferences")>()),
  useUserPreferencesStore: (selector: (state: typeof preferences) => unknown) =>
    selector(preferences),
}));

const projectMembers: { id: string; name: string; image: string | null }[] = [];
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: projectMembers, isSuccess: true }),
}));

const projectRelations: {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
}[] = [];
vi.mock("@/hooks/queries/task-relation/use-get-project-task-relations", () => ({
  default: () => ({ data: projectRelations }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canAssignTasks: () => true }),
}));

vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/components/common/project-layout", () => ({
  default: ({
    children,
    toolbar,
    summary,
  }: {
    children: ReactNode;
    toolbar?: ReactNode;
    summary?: ReactNode;
  }) => (
    <div>
      {toolbar}
      {summary}
      {children}
    </div>
  ),
}));

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

vi.mock("@/components/task/task-details-sheet", () => ({
  default: () => null,
}));

vi.mock("@/components/page-title", () => ({
  default: () => null,
}));

vi.mock("@/components/gantt/gantt-task-bar", () => ({
  GanttTaskBar: ({ task }: { task: { title: string } }) => (
    <div>{task.title}</div>
  ),
}));

// Resolves against the real en-US bundle, so the assertions fail if the
// jumpToToday key (or its interpolated siblings) stops matching what the
// component actually requests.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const [namespace, path] = key.split(":");
      const lookup = (keyPath: string) =>
        keyPath
          .split(".")
          .reduce<unknown>(
            (accumulator, part) =>
              (accumulator as Record<string, unknown> | undefined)?.[part],
            (enUS as Record<string, unknown>)[namespace],
          );
      // English plural forms, as i18next resolves them for `count`.
      const plural =
        typeof options?.count === "number"
          ? lookup(`${path}_${options.count === 1 ? "one" : "other"}`)
          : undefined;
      const source = plural ?? lookup(path);

      if (typeof source !== "string") return key;

      return source.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(options?.[name] ?? `{{${name}}}`),
      );
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const GanttRoute = (Route as unknown as { component: ComponentType }).component;

function searchFor(value: string) {
  const existing = screen.queryByRole("searchbox", { name: "Search tasks" });
  if (!existing) {
    fireEvent.click(screen.getByRole("button", { name: "Search tasks" }));
  }
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tasks" }), {
    target: { value },
  });
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Task",
    number: 1,
    description: null,
    status: "in-progress",
    priority: null,
    startDate: null,
    dueDate: null,
    position: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId: "project-1",
    ...overrides,
  };
}

function mockProjectWithTask(
  task: Task,
  overrides: { id?: string; name?: string } = {},
) {
  mockProjectWithTasks([task], overrides);
}

function mockProjectWithTasks(
  tasks: Task[],
  overrides: { id?: string; name?: string } = {},
) {
  useGetTasks.mockReturnValue({
    isSuccess: true,
    data: {
      id: overrides.id ?? "project-1",
      name: overrides.name ?? "Roadmap",
      slug: "RM",
      columns: [{ id: "col-1", name: "In Progress", tasks }],
      plannedTasks: [],
      archivedTasks: [],
    },
  });
}

beforeEach(() => {
  // Fixed "today" so the timeline range and isToday() checks are
  // deterministic regardless of when the suite runs.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 31));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  scrollIntoView.mockClear();
  useGetTasks.mockReset();
  routeParams.projectId = "project-1";
  preferences.ganttGroupBy = "none";
  projectMembers.length = 0;
  projectRelations.length = 0;
});

describe("Gantt jump-to-today", () => {
  it("centers a new project after a search stops hiding its timeline", () => {
    mockProjectWithTask(
      makeTask({
        title: "First task",
        startDate: "2026-08-28",
        dueDate: "2026-09-02",
      }),
    );
    const { rerender } = render(<GanttRoute />);
    searchFor("no match");
    routeParams.projectId = "project-2";
    mockProjectWithTask(
      makeTask({
        title: "Second task",
        startDate: "2026-08-28",
        dueDate: "2026-09-02",
      }),
      { id: "project-2" },
    );
    rerender(<GanttRoute />);

    searchFor("");

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: "auto", inline: "center" }),
    );
  });
  it("never auto-scrolls to a far-off today, but still jumps there on demand", () => {
    mockProjectWithTask(
      makeTask({
        id: "past-task",
        title: "Old milestone",
        startDate: "2025-01-01",
        dueDate: "2025-01-03",
      }),
    );

    const { container } = render(<GanttRoute />);

    // Today (Aug 31, 2026) is outside the span the project opens on, so
    // opening the view leaves the scroll where the project's work is.
    expect(container.querySelector('[aria-current="date"]')).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();

    const button = screen.getByRole("button", { name: "Jump to today" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    // The timeline re-centres on today, so its column now exists.
    expect(container.querySelector('[aria-current="date"]')).toHaveTextContent(
      "31",
    );
    expect(screen.getAllByText("Old milestone").length).toBeGreaterThan(0);
  });

  it("doesn't auto-centre on today when only the minimum span reaches it", () => {
    mockProjectWithTask(
      makeTask({
        id: "spring-task",
        title: "Spring launch",
        startDate: "2026-05-01",
        dueDate: "2026-05-03",
      }),
    );

    const { container } = render(<GanttRoute />);

    // The span is padded to a minimum width that happens to reach today,
    // but the work is months away, so the view opens where the work is.
    expect(container.querySelector('[aria-current="date"]')).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("auto-centers on today and re-centers on demand when today is in range", () => {
    mockProjectWithTask(
      makeTask({
        id: "current-task",
        title: "Ongoing work",
        startDate: "2026-08-28",
        dueDate: "2026-09-02",
      }),
    );

    render(<GanttRoute />);

    // The mount-time effect scrolls today's column into view without
    // animating, so it doesn't fight the user for scroll position on load.
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: "auto", inline: "center" }),
    );

    const button = screen.getByRole("button", { name: "Jump to today" });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    // A manual click animates instead, so its intent reads as a deliberate
    // jump rather than the page settling into place.
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: "smooth", inline: "center" }),
    );
  });

  it("re-arms auto-centering after switching to a different project on the same route", () => {
    mockProjectWithTask(
      makeTask({
        id: "current-task",
        title: "Ongoing work",
        startDate: "2026-08-28",
        dueDate: "2026-09-02",
      }),
    );

    const { rerender } = render(<GanttRoute />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // The in-page Gantt project selector changes `projectId` without
    // unmounting this route component, so a fresh task near today on the
    // newly selected project must still trigger the mount-time auto-center —
    // the one-time guard from the previous project shouldn't carry over.
    routeParams.projectId = "project-2";
    mockProjectWithTask(
      makeTask({
        id: "other-project-task",
        title: "Other project's work",
        startDate: "2026-08-30",
        dueDate: "2026-09-03",
      }),
      { id: "project-2", name: "Other roadmap" },
    );

    rerender(<GanttRoute />);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: "auto", inline: "center" }),
    );
  });

  it("disables the button once a search filters out every task, even with today in range", () => {
    mockProjectWithTask(
      makeTask({
        id: "current-task",
        title: "Ongoing work",
        startDate: "2026-08-28",
        dueDate: "2026-09-02",
      }),
    );

    render(<GanttRoute />);

    const button = screen.getByRole("button", { name: "Jump to today" });
    expect(button).not.toBeDisabled();

    // The search narrows the *visible* timeline down to nothing, even though
    // today is still within the unfiltered project's date range — the button
    // has nothing left to scroll to and must reflect that.
    searchFor("no such task");

    expect(
      screen.getByText("No tasks match your search or filters."),
    ).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("insets scroll-alignment by the task rail's width so a scrollIntoView center lands in the visible timeline", () => {
    mockProjectWithTask(
      makeTask({
        id: "current-task",
        title: "Ongoing work",
        startDate: "2026-08-28",
        dueDate: "2026-09-02",
      }),
    );

    render(<GanttRoute />);

    // The task rail renders at a fixed 20rem on desktop (see the `left`
    // offset used by the timeline track below it); scroll-padding has to
    // match that exactly, or "centering" on today still lands it partway
    // under the rail.
    //
    // Asserted against the raw inline style rather than via `toHaveStyle`:
    // jsdom resolves `getComputedStyle()` rem units to pixels (assuming the
    // default 16px root), which would make a "20rem" expectation compare
    // against a computed "320px" and fail regardless of whether the
    // component is correct.
    const container = screen.getByTestId("gantt-scroll-container");
    expect(container.style.scrollPaddingLeft).toBe("20rem");
  });
});

describe("Gantt group by assignee", () => {
  const laneKeys = (container: HTMLElement) =>
    Array.from(
      container.querySelectorAll<HTMLElement>("[data-gantt-lane]"),
    ).map((lane) => lane.dataset.ganttLane);
  const lane = (container: HTMLElement, key: string) => {
    const element = container.querySelector<HTMLElement>(
      `[data-gantt-lane="${key}"]`,
    );
    if (!element) throw new Error(`lane ${key} not rendered`);
    return element;
  };

  function mockTeamProject() {
    projectMembers.push(
      { id: "u-zoe", name: "Zoe", image: null },
      { id: "u-al", name: "alice", image: null },
      { id: "u-bob", name: "Bob", image: null },
    );
    mockProjectWithTasks([
      makeTask({
        id: "zoe-task",
        title: "Zoe's work",
        userId: "u-zoe",
        assigneeId: "u-zoe",
        assigneeName: "Zoe",
        startDate: "2026-09-01",
        dueDate: "2026-09-03",
      }),
      makeTask({
        id: "alpha",
        title: "Alpha",
        userId: "u-al",
        assigneeId: "u-al",
        assigneeName: "alice",
        startDate: "2026-08-28",
        dueDate: "2026-09-02",
      }),
      makeTask({
        id: "beta",
        title: "Beta",
        userId: "u-al",
        assigneeId: "u-al",
        assigneeName: "alice",
        startDate: "2026-09-05",
        dueDate: "2026-09-10",
      }),
      makeTask({
        id: "loose",
        title: "Loose end",
        startDate: "2026-09-02",
        dueDate: "2026-09-02",
      }),
    ]);
  }

  it("shows a lane per project member, alphabetically, with Unassigned last", () => {
    preferences.ganttGroupBy = "assignee";
    mockTeamProject();

    const { container } = render(<GanttRoute />);

    expect(laneKeys(container)).toEqual([
      "member:u-al",
      "member:u-bob",
      "member:u-zoe",
      "unassigned",
    ]);
    expect(
      within(lane(container, "member:u-al")).getByRole("button", {
        name: "alice 2 tasks",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    // Bob has nothing scheduled: a compact, non-collapsible drop target.
    const bobLane = lane(container, "member:u-bob");
    expect(within(bobLane).queryByRole("button")).not.toBeInTheDocument();
    expect(within(bobLane).getByText("0 tasks")).toBeInTheDocument();
    expect(
      within(lane(container, "unassigned")).getAllByText("Loose end").length,
    ).toBeGreaterThan(0);
  });

  it("collapses and expands a lane from its header", () => {
    preferences.ganttGroupBy = "assignee";
    mockTeamProject();

    const { container } = render(<GanttRoute />);
    const aliceLane = lane(container, "member:u-al");
    const toggle = within(aliceLane).getByRole("button", {
      name: "alice 2 tasks",
    });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(aliceLane).queryAllByText("Alpha")).toHaveLength(0);
    // The summary bar stays, so a collapsed lane still shows its span.
    expect(
      within(aliceLane).getByTestId("gantt-lane-summary"),
    ).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(aliceLane).getAllByText("Alpha").length).toBeGreaterThan(0);
  });

  it("spans the lane summary bar from the earliest start to the latest end", () => {
    preferences.ganttGroupBy = "assignee";
    mockTeamProject();

    const { container } = render(<GanttRoute />);

    // Week starts Sunday and today is Aug 31, so the window opens a week
    // before the earliest task's week: Aug 16. Alpha starts Aug 28 (column
    // 13); Beta ends Sep 10 (column 26, exclusive end line 27).
    const summary = within(lane(container, "member:u-al")).getByTestId(
      "gantt-lane-summary",
    );
    expect(summary.getAttribute("style")).toContain("grid-column: 13 / 27");
  });

  it("drops the assignee from grouped rows but keeps it in the flat list", () => {
    preferences.ganttGroupBy = "assignee";
    mockTeamProject();

    const { container, rerender } = render(<GanttRoute />);
    expect(screen.queryByText(/• alice/)).not.toBeInTheDocument();

    preferences.ganttGroupBy = "none";
    rerender(<GanttRoute />);
    expect(container.querySelector("[data-gantt-lane]")).toBeNull();
    expect(screen.getAllByText(/• alice/)).toHaveLength(2);
  });

  it("falls back to the flat list for an unknown stored grouping", () => {
    preferences.ganttGroupBy = "status";
    mockTeamProject();

    const { container } = render(<GanttRoute />);

    expect(container.querySelector("[data-gantt-lane]")).toBeNull();
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
  });
});

describe("Gantt features on member lines", () => {
  const lane = (container: HTMLElement, key: string) => {
    const element = container.querySelector<HTMLElement>(
      `[data-gantt-lane="${key}"]`,
    );
    if (!element) throw new Error(`lane ${key} not rendered`);
    return element;
  };
  const row = (container: HTMLElement, taskId: string) =>
    container.querySelector(`[data-gantt-row="${taskId}"]`);
  const alice = {
    userId: "u-al",
    assigneeId: "u-al",
    assigneeName: "Alice",
  };
  const bob = { userId: "u-bob", assigneeId: "u-bob", assigneeName: "Bob" };

  function mockFeatureProject() {
    projectMembers.push(
      { id: "u-al", name: "Alice", image: null },
      { id: "u-bob", name: "Bob", image: null },
    );
    mockProjectWithTasks([
      makeTask({
        id: "checkout",
        title: "Checkout",
        type: "feature",
        ...bob,
        startDate: "2026-09-01",
        dueDate: "2026-09-20",
      }),
      makeTask({
        id: "cart",
        title: "Cart page",
        featureId: "checkout",
        ...alice,
        startDate: "2026-09-02",
        dueDate: "2026-09-04",
      }),
      makeTask({
        id: "pay",
        title: "Payment form",
        featureId: "checkout",
        ...alice,
        startDate: "2026-09-06",
        dueDate: "2026-09-08",
      }),
      makeTask({
        id: "tax",
        title: "Tax rules",
        featureId: "checkout",
        ...bob,
        startDate: "2026-09-03",
        dueDate: "2026-09-05",
      }),
      // Nothing scheduled in it, so it keeps its own row.
      makeTask({
        id: "search",
        title: "Search",
        type: "feature",
        ...alice,
        startDate: "2026-09-10",
        dueDate: "2026-09-12",
      }),
    ]);
  }

  it("moves features from the rows onto the lines of the members doing their tasks", () => {
    preferences.ganttGroupBy = "assignee";
    mockFeatureProject();

    const { container } = render(<GanttRoute />);

    expect(row(container, "checkout")).toBeNull();
    const aliceLane = lane(container, "member:u-al");
    expect(
      within(aliceLane).getByRole("group", { name: "Features" }),
    ).toBeInTheDocument();
    expect(
      within(aliceLane).getByRole("button", {
        name: "Checkout: 2 tasks, Sep 2, 2026 to Sep 8, 2026. Opens the feature.",
      }),
    ).toBeInTheDocument();
    expect(
      within(lane(container, "member:u-bob")).getByRole("button", {
        name: "Checkout: 1 task, Sep 3, 2026 to Sep 5, 2026. Opens the feature.",
      }),
    ).toBeInTheDocument();
    // The feature no longer counts as Bob's row, or in the task count.
    expect(
      within(lane(container, "member:u-bob")).getByRole("button", {
        name: "Bob 1 task",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("4 tasks")).toBeInTheDocument();
  });

  it("keeps a feature with nothing scheduled in it as a row", () => {
    preferences.ganttGroupBy = "assignee";
    mockFeatureProject();

    const { container } = render(<GanttRoute />);

    expect(
      lane(container, "member:u-al").querySelector('[data-gantt-row="search"]'),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Search: / }),
    ).not.toBeInTheDocument();
  });

  it("keeps a feature in a dependency as a row, still counted", () => {
    preferences.ganttGroupBy = "assignee";
    mockFeatureProject();
    projectRelations.push({
      id: "checkout-blocks-search",
      sourceTaskId: "checkout",
      targetTaskId: "search",
      relationType: "blocks",
    });

    const { container } = render(<GanttRoute />);
    const bobLane = lane(container, "member:u-bob");

    // Its arrow needs a row to start from; the slices stay too.
    expect(bobLane.querySelector('[data-gantt-row="checkout"]')).not.toBeNull();
    expect(
      within(lane(container, "member:u-al")).getByRole("button", {
        name: /^Checkout: 2 tasks/,
      }),
    ).toBeInTheDocument();
    expect(
      within(bobLane).getByRole("button", { name: "Bob 2 tasks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("5 tasks")).toBeInTheDocument();
  });

  it("keeps a feature with no free track reachable across all its days", () => {
    preferences.ganttGroupBy = "assignee";
    projectMembers.push({ id: "u-al", name: "Alice", image: null });
    // A, B and C take Alice's three tracks and end Sep 30; D finds no track
    // and runs on to Dec 15, months past them.
    const spans = [
      ["a", "2026-09-01", "2026-09-30"],
      ["b", "2026-09-01", "2026-09-30"],
      ["c", "2026-09-02", "2026-09-30"],
      ["d", "2026-09-03", "2026-12-15"],
    ] as const;
    mockProjectWithTasks(
      spans.flatMap(([id, startDate, dueDate]) => [
        makeTask({ id, title: `Feature ${id}`, type: "feature" }),
        makeTask({
          id: `${id}-work`,
          title: `Work ${id}`,
          featureId: id,
          ...alice,
          startDate,
          dueDate,
        }),
      ]),
    );

    const { container } = render(<GanttRoute />);
    const aliceLane = lane(container, "member:u-al");
    const columns = (element: HTMLElement | null) =>
      (element?.style.gridColumn ?? "").split(" / ").map(Number);

    const chip = within(aliceLane).getByRole("button", {
      name: "1 more feature",
    });
    const [sliceStart = 0] = columns(
      within(aliceLane).getByRole("button", { name: /^Feature a: / }),
    );
    const [boxStart = 0, boxEnd = 0] = columns(
      chip.closest<HTMLElement>("[data-gantt-feature-overflow]"),
    );
    // The chip's box covers D's 104 days, from two days after A starts, so
    // the chip stays on screen while any of them is.
    expect(boxStart).toBe(sliceStart + 2);
    expect(boxEnd - boxStart).toBe(104);
    // Sticky, just clear of the 20rem task rail painted over the timeline.
    expect(chip).toHaveClass("sticky");
    expect(chip.style.left).toBe("20.125rem");
  });

  it("keeps the slices on a collapsed lane", () => {
    preferences.ganttGroupBy = "assignee";
    mockFeatureProject();

    const { container } = render(<GanttRoute />);
    const aliceLane = lane(container, "member:u-al");
    fireEvent.click(
      within(aliceLane).getByRole("button", { name: "Alice 3 tasks" }),
    );

    expect(within(aliceLane).queryAllByText("Cart page")).toHaveLength(0);
    expect(
      within(aliceLane).getByRole("button", { name: /^Checkout: 2 tasks/ }),
    ).toBeInTheDocument();
  });

  it("opens the feature from its slice", () => {
    preferences.ganttGroupBy = "assignee";
    mockFeatureProject();

    const { container } = render(<GanttRoute />);
    fireEvent.click(
      within(lane(container, "member:u-bob")).getByRole("button", {
        name: /^Checkout: /,
      }),
    );

    expect(navigate).toHaveBeenCalledWith({
      to: ".",
      search: { taskId: "checkout" },
      replace: true,
    });
  });

  it("follows the filters, keeping the title of a filtered-out feature", () => {
    preferences.ganttGroupBy = "assignee";
    mockFeatureProject();

    const { container } = render(<GanttRoute />);
    searchFor("Cart");

    expect(
      within(lane(container, "member:u-al")).getByRole("button", {
        name: "Checkout: 1 task, Sep 2, 2026 to Sep 4, 2026. Opens the feature.",
      }),
    ).toBeInTheDocument();
    expect(
      within(lane(container, "member:u-bob")).queryByRole("group", {
        name: "Features",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 of 4 tasks")).toBeInTheDocument();
  });

  it("leaves the flat timeline as it was", () => {
    mockFeatureProject();

    const { container } = render(<GanttRoute />);

    expect(row(container, "checkout")).not.toBeNull();
    expect(row(container, "search")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "Features" })).toBeNull();
    expect(screen.getByText("5 tasks")).toBeInTheDocument();
  });
});

describe("Gantt navigation", () => {
  it("doesn't centre on today later, when a jump brings today into view", () => {
    // Work from July 2025 to Aug 12, 2026: today (Aug 31) is near the end of
    // it, but the span opens around the first task, so today isn't rendered.
    mockProjectWithTasks([
      makeTask({
        id: "early",
        title: "Early work",
        startDate: "2025-07-01",
        dueDate: "2025-07-05",
      }),
      makeTask({
        id: "recent",
        title: "Recent work",
        startDate: "2026-08-10",
        dueDate: "2026-08-12",
      }),
    ]);
    const { container } = render(<GanttRoute />);
    expect(container.querySelector('[aria-current="date"]')).toBeNull();

    fireEvent.change(screen.getByLabelText("Timeline start date"), {
      target: { value: "2026-08-20" },
    });

    // The jump re-centred the span so today is rendered now, but the view
    // stays on the date the reader asked for.
    expect(container.querySelector('[aria-current="date"]')).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("offers the board when nothing is scheduled", () => {
    mockProjectWithTask(makeTask({ title: "Undated idea" }));

    render(<GanttRoute />);
    fireEvent.click(screen.getByRole("button", { name: "Board" }));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      }),
    );
  });
});
