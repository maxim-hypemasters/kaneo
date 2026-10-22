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
import enUS from "@i18n/en-US.json";
import {
  act,
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
import { releaseSummaries } from "@/lib/releases/release-summaries";
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
  Link: ({
    to,
    params = {},
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      href={Object.entries(params).reduce(
        (path, [name, value]) => path.replace(`$${name}`, value),
        to,
      )}
      {...props}
    >
      {children}
    </a>
  ),
}));

const useGetTasks = vi.fn();
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: (projectId: string) => useGetTasks(projectId),
}));

// Mutable like routeParams; reset after each test.
const releasesQuery: { data: unknown[] | undefined; isPending: boolean } = {
  data: [],
  isPending: false,
};
const useGetReleases = vi.fn((..._args: unknown[]) => releasesQuery);
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: (...args: unknown[]) => useGetReleases(...args),
}));

let mobile = false;
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mobile,
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
const membersQuery = vi.fn((_options: { enabled?: boolean }) => ({
  data: projectMembers,
  isSuccess: true,
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: (options: { enabled?: boolean }) => membersQuery(options),
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
  useWorkspacePermission: () => ({
    canAssignTasks: () => true,
    canUpdateTasks: () => true,
  }),
}));

const updateTask = vi.fn();
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: updateTask }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({ mutateAsync: vi.fn() }),
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
    releases: [],
    releasesLoading: false,
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

const barDragChanges = new Map<
  string,
  ((dragging: boolean) => void) | undefined
>();
vi.mock("@/components/gantt/gantt-task-bar", () => ({
  GanttTaskBar: ({
    task,
    showAssignee,
    timeline,
    pixelsPerDay,
    onDragChange,
  }: {
    task: { id: string; title: string };
    showAssignee?: boolean;
    timeline: { gridTemplateColumns: string };
    pixelsPerDay: number;
    onDragChange?: (dragging: boolean) => void;
  }) => {
    barDragChanges.set(task.id, onDragChange);
    return (
      <div
        data-bar={task.id}
        data-bar-assignee={showAssignee ? "" : undefined}
        data-day-columns={timeline.gridTemplateColumns}
        data-pixels-per-day={pixelsPerDay}
      >
        {task.title}
      </div>
    );
  },
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
  membersQuery.mockClear();
  routeParams.projectId = "project-1";
  releasesQuery.data = [];
  releasesQuery.isPending = false;
  window.localStorage.clear();
  preferences.ganttGroupBy = "none";
  projectMembers.length = 0;
  projectRelations.length = 0;
  updateTask.mockClear();
  barDragChanges.clear();
  mobile = false;
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

describe("Features are knowledge records", () => {
  it("excludes Features and their relations from the schedule", () => {
    mockProjectWithTasks([
      makeTask({
        id: "feature",
        title: "Knowledge record",
        type: "feature",
        startDate: "2026-09-01",
        dueDate: "2026-09-10",
      }),
      makeTask({
        id: "work",
        title: "Execution task",
        featureId: "feature",
        startDate: "2026-09-02",
        dueDate: "2026-09-03",
      }),
    ]);
    const { container } = render(<GanttRoute />);
    expect(container.querySelector('[data-gantt-row="feature"]')).toBeNull();
    expect(
      container.querySelector('[data-gantt-row="work"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("1 task")).toBeInTheDocument();
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

describe("Gantt releases", () => {
  const release = (overrides: Record<string, string> = {}) => ({
    id: "release-24",
    projectId: "project-1",
    name: "2.4",
    description: null,
    startDate: "2026-08-24",
    codeFreezeDate: "2026-09-04",
    submissionDate: "2026-09-04",
    ...overrides,
  });
  const lines = (container: HTMLElement) =>
    [
      ...container.querySelectorAll<HTMLElement>(
        "[data-gantt-release-markers] [data-release-line]",
      ),
    ].map((line) => line.dataset.releaseLine);

  it("reads the releases without the progress it never shows", () => {
    mockProjectWithTask(
      makeTask({ startDate: "2026-08-28", dueDate: "2026-09-02" }),
    );

    render(<GanttRoute />);

    // So a completion elsewhere, which only changes progress, doesn't redraw
    // every row.
    expect(useGetReleases).toHaveBeenLastCalledWith("project-1", {
      select: releaseSummaries,
    });
  });

  it("draws a line at each release date and links its label to the release", () => {
    releasesQuery.data = [release()];
    mockProjectWithTask(
      makeTask({ startDate: "2026-08-28", dueDate: "2026-09-02" }),
    );

    const { container } = render(<GanttRoute />);

    expect(lines(container)).toEqual(["start", "codeFreeze", "submission"]);
    const strip = screen.getByRole("list", { name: "Releases" });
    expect(
      within(strip).getByRole("link", { name: "2.4: Start, Aug 24" }),
    ).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace-1/project/project-1/releases/release-24",
    );
    expect(
      within(strip).getByRole("link", {
        name: "2.4: Code freeze and Submission, Sep 4",
      }),
    ).toBeVisible();
  });

  it("follows the Release filter", () => {
    window.localStorage.setItem(
      "kaneo:board-filters:project-1",
      JSON.stringify({ release: ["none"] }),
    );
    releasesQuery.data = [release()];
    mockProjectWithTask(
      makeTask({ startDate: "2026-08-28", dueDate: "2026-09-02" }),
    );

    const { container } = render(<GanttRoute />);

    // The task, in no release, still shows; the release's lines don't.
    expect(container.querySelector('[data-bar="task-1"]')).not.toBeNull();
    expect(lines(container)).toEqual([]);
    expect(screen.queryByRole("list", { name: "Releases" })).toBeNull();
  });

  it("waits for the releases, then opens on a current one around today", () => {
    releasesQuery.isPending = true;
    releasesQuery.data = undefined;
    mockProjectWithTask(
      makeTask({
        id: "past-task",
        title: "Old milestone",
        startDate: "2025-01-01",
        dueDate: "2025-01-03",
      }),
    );
    const { container, rerender } = render(<GanttRoute />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    releasesQuery.isPending = false;
    releasesQuery.data = [
      release({
        startDate: "2026-08-01",
        codeFreezeDate: "2026-09-10",
        submissionDate: "2026-09-20",
      }),
    ];
    rerender(<GanttRoute />);

    // Today (Aug 31) is in the release, so the chart opens on it although
    // the task is far off.
    expect(container.querySelector('[aria-current="date"]')).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto", inline: "center" }),
    );
  });
});

describe("Gantt Shift-wheel zoom", () => {
  function setupZoom() {
    const view = render(<GanttRoute />);
    const scroller = screen.getByTestId("gantt-scroll-container");
    const track = [...scroller.querySelectorAll<HTMLElement>("[style]")].find(
      (element) =>
        element.style.left === "20rem" &&
        Boolean(element.style.gridTemplateColumns) &&
        !element.hasAttribute("data-gantt-release-markers"),
    );
    if (!track) throw new Error("timeline track not rendered");
    Object.defineProperty(track, "clientWidth", {
      get: () => Number.parseFloat(track.style.width) * 16,
    });
    Object.defineProperties(scroller, {
      clientWidth: { value: 1100 },
      scrollWidth: { get: () => track.clientWidth + 320 },
    });
    scroller.scrollLeft = 2200;
    const timelineTarget = scroller.querySelector('[aria-current="date"]');
    if (!timelineTarget) throw new Error("today header not rendered");
    return { ...view, scroller, track, timelineTarget };
  }

  function zoom(target: Element, deltaY = -120) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      deltaY,
      clientX: 700,
    });
    act(() => {
      target.dispatchEvent(event);
      vi.advanceTimersByTime(100);
    });
    return event;
  }

  it("scales task geometry, release markers, labels and dependencies together without writing dates", () => {
    const task = makeTask({
      id: "source",
      startDate: "2026-08-28",
      dueDate: "2026-08-30",
    });
    mockProjectWithTasks([
      task,
      makeTask({
        id: "target",
        startDate: "2026-08-31",
        dueDate: "2026-09-02",
      }),
    ]);
    projectRelations.push({
      id: "dependency",
      sourceTaskId: "source",
      targetTaskId: "target",
      relationType: "blocks",
    });
    releasesQuery.data = [
      {
        id: "release",
        projectId: "project-1",
        name: "Launch",
        startDate: "2026-08-24",
        codeFreezeDate: "2026-09-04",
        submissionDate: "2026-09-05",
      },
    ];
    const { container, track, timelineTarget } = setupZoom();
    const beforeColumns = track.style.gridTemplateColumns;
    const beforePath = screen
      .getByTestId("gantt-dependency-lines")
      .querySelector("path[marker-end]")
      ?.getAttribute("d");
    const label = screen.getByRole("list", { name: "Releases" });
    const beforeLabelWidth = label.style.width;

    expect(zoom(timelineTarget).defaultPrevented).toBe(true);

    expect(track.style.gridTemplateColumns).not.toBe(beforeColumns);
    const dayWidth = /minmax\(([\d.]+)rem/.exec(
      track.style.gridTemplateColumns,
    )?.[1];
    expect(Number(dayWidth)).toBeGreaterThan(2.75);
    for (const bar of container.querySelectorAll<HTMLElement>("[data-bar]")) {
      expect(bar.dataset.dayColumns).toBe(track.style.gridTemplateColumns);
      expect(Number(bar.dataset.pixelsPerDay)).toBeCloseTo(
        Number(dayWidth) * 16,
      );
    }
    expect(
      container.querySelector<HTMLElement>("[data-gantt-release-markers]")
        ?.style.gridTemplateColumns,
    ).toBe(track.style.gridTemplateColumns);
    expect(label.style.width).not.toBe(beforeLabelWidth);
    expect(
      screen
        .getByTestId("gantt-dependency-lines")
        .querySelector("path[marker-end]")
        ?.getAttribute("d"),
    ).not.toBe(beforePath);
    expect(updateTask).not.toHaveBeenCalled();
    expect(task).toMatchObject({
      startDate: "2026-08-28",
      dueDate: "2026-08-30",
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("retains zoom through grouping, filtering and responsive updates, then resets for another project", () => {
    mockProjectWithTask(
      makeTask({ startDate: "2026-08-28", dueDate: "2026-09-02" }),
    );
    const { rerender, track, timelineTarget } = setupZoom();
    zoom(timelineTarget);
    const zoomed = track.style.gridTemplateColumns;

    preferences.ganttGroupBy = "assignee";
    rerender(<GanttRoute />);
    expect(track.style.gridTemplateColumns).toBe(zoomed);
    searchFor("Task");
    expect(track.style.gridTemplateColumns).toBe(zoomed);
    mobile = true;
    rerender(<GanttRoute />);
    expect(track.style.gridTemplateColumns).toBe(zoomed);

    routeParams.projectId = "project-2";
    mockProjectWithTask(
      makeTask({
        projectId: "project-2",
        startDate: "2026-08-28",
        dueDate: "2026-09-02",
      }),
      { id: "project-2" },
    );
    rerender(<GanttRoute />);
    expect(track.style.gridTemplateColumns).toContain("minmax(3.125rem");
  });

  it("suspends zoom for an unrelated task gesture and resumes after it ends", () => {
    mockProjectWithTask(
      makeTask({ startDate: "2026-08-28", dueDate: "2026-09-02" }),
    );
    const { track, timelineTarget } = setupZoom();
    const before = track.style.gridTemplateColumns;
    const drag = barDragChanges.get("task-1");
    expect(drag).toBeTypeOf("function");

    act(() => drag?.(true));
    expect(zoom(timelineTarget).defaultPrevented).toBe(true);
    expect(track.style.gridTemplateColumns).toBe(before);
    act(() => drag?.(false));
    zoom(timelineTarget);
    expect(track.style.gridTemplateColumns).not.toBe(before);
    expect(updateTask).not.toHaveBeenCalled();
  });
});
