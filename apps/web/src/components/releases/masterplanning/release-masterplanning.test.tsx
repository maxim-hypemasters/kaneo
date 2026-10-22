import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { MilestoneWithFeature } from "@/fetchers/milestone/milestones";
import { HttpError } from "@/lib/http-error";
import type { Release } from "@/types/release";
import { ReleaseMasterplanning } from "./release-masterplanning";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  members: vi.fn(),
  refetch: vi.fn(),
  memberRefetch: vi.fn(),
  move: vi.fn(),
  retry: vi.fn(),
  board: vi.fn(),
  history: vi.fn(),
  dnd: {} as Record<string, (event: unknown) => void>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
    i18n: { resolvedLanguage: "en-US", language: "en-US" },
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    ...props
  }: {
    children: ReactNode;
    params: { releaseId: string };
    to?: string;
    title?: string;
    className?: string;
  }) => (
    <a href={`/releases/${params.releaseId}`} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...handlers }: { children: ReactNode }) => {
    mocks.dnd = handlers;
    return children;
  },
  DragOverlay: () => null,
  MouseSensor: {},
  TouchSensor: {},
  pointerWithin: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));
vi.mock("@/hooks/queries/milestone/use-get-project-milestones", () => ({
  useGetProjectMilestones: (...args: unknown[]) => mocks.query(...args),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: (...args: unknown[]) => mocks.members(...args),
}));
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({ default: mocks.board }));
vi.mock("@/hooks/queries/release/use-get-release-progress", () => ({
  useGetReleaseProgress: mocks.history,
}));
vi.mock("./use-move-masterplanning-milestone", () => ({
  useMoveMasterplanningMilestone: (
    _projectId: string,
    data: MilestoneWithFeature[] = [],
  ) => ({
    milestones: data,
    pendingIds: new Set(),
    failures: new Map(),
    move: mocks.move,
    retry: mocks.retry,
  }),
}));
vi.mock("./masterplanning-milestone-row", () => ({
  MasterplanningMilestoneRow: ({
    milestone,
    canMove,
    onMove,
    onRetry,
    leadName,
  }: {
    milestone: MilestoneWithFeature;
    canMove: boolean;
    onMove: (releaseId: string | null) => void;
    onRetry: () => void;
    leadName?: string;
  }) => (
    <li data-milestone-id={milestone.id}>
      <button type="button" id={`masterplanning-milestone-${milestone.id}`}>
        {milestone.title}
      </button>
      <span>{leadName}</span>
      {canMove && (
        <>
          <button type="button" onClick={() => onMove("future")}>
            Move {milestone.title}
          </button>
          <button type="button" onClick={() => onMove(null)}>
            Unassign {milestone.title}
          </button>
          <button type="button" onClick={onRetry}>
            Retry {milestone.title}
          </button>
        </>
      )}
    </li>
  ),
}));
vi.mock("../release-actions-menu", () => ({ ReleaseActionsMenu: () => null }));
vi.mock("./create-masterplanning-milestone-dialog", () => ({
  CreateMasterplanningMilestoneDialog: ({
    projectId,
    initialReleaseId,
    onClose,
  }: {
    projectId: string;
    initialReleaseId: string | null;
    onClose: () => void;
  }) => (
    <section
      role="dialog"
      aria-label="Create milestone"
      data-project-id={projectId}
      data-release-id={initialReleaseId ?? "none"}
    >
      <button type="button" onClick={onClose}>
        Cancel milestone
      </button>
    </section>
  ),
}));

const scroll = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  if (options.top !== undefined) this.scrollTop = options.top;
});
let client: QueryClient;
let data: MilestoneWithFeature[] | undefined;
let error: unknown;
let isFetching = false;
function milestone(
  id: string,
  releaseId: string | null,
  featureTitle = "Feature A",
  position = 0,
): MilestoneWithFeature {
  return {
    id,
    title: id,
    featureId: featureTitle,
    featureTitle,
    projectId: "p",
    position,
    releaseId,
    leadId: null,
    status: "to-do",
    columnId: null,
    priority: "no-priority",
    startDate: null,
    endDate: null,
    createdAt: "",
    updatedAt: "",
    progress: { total: 0, started: 0, completed: 0 },
  };
}
function release(
  id: string,
  startDate: string,
  submissionDate: string,
): Release {
  return {
    id,
    projectId: "p",
    name: id,
    description: null,
    startDate,
    codeFreezeDate: submissionDate,
    submissionDate,
    createdAt: "",
    updatedAt: "",
    progress: {
      tasks: { total: 0, completed: 0 },
      features: { total: 0, completed: 0 },
      unfinished: 0,
    },
  };
}
const releases = [
  release("past", "2026-09-01", "2026-09-30"),
  release("active", "2026-10-01", "2026-10-30"),
  release("future", "2026-11-01", "2026-11-30"),
];
function View({
  canMove = true,
  items = releases,
  today = "2026-10-22",
}: {
  canMove?: boolean;
  items?: Release[];
  today?: string;
}) {
  return (
    <QueryClientProvider client={client}>
      <ReleaseMasterplanning
        releases={items}
        counts={new Map()}
        today={today}
        workspaceId="w"
        projectId="p"
        permissions={{
          canManage: false,
          canMoveItems: canMove,
          canDelete: false,
          canCreateTasks: false,
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMoveUnfinished={vi.fn()}
      />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  data = [];
  error = undefined;
  isFetching = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.query.mockImplementation(() => ({
    data,
    error,
    isError: Boolean(error),
    isFetching,
    refetch: mocks.refetch,
  }));
  mocks.members.mockReturnValue({
    data: [{ id: "lead", name: "Max" }],
    isError: false,
    isFetching: false,
    refetch: mocks.memberRefetch,
  });
  mocks.move.mockResolvedValue(true);
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: scroll,
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

function geometry() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index =
        this.tagName === "LI"
          ? Array.from(this.parentElement?.children ?? []).indexOf(this)
          : 0;
      const top =
        100 +
        index * 80 -
        (this.tagName === "LI"
          ? (this.parentElement?.parentElement?.scrollTop ?? 0)
          : 0);
      return {
        x: 0,
        y: top,
        top,
        bottom: top + 80,
        left: 0,
        right: 800,
        width: 800,
        height: 80,
        toJSON: () => ({}),
      };
    },
  );
}

describe("Masterplanning release groups", () => {
  it("shows phase-ordered releases, empty destinations and explicit membership once, with No release last", () => {
    data = [
      milestone("Later", "active", "Z feature"),
      milestone("Second", "active", "Feature A", 2),
      milestone("First", "active", "Feature A", 1),
      milestone("Unassigned", null),
      milestone("Missing release", "gone"),
    ];
    render(<View />);
    const timeline = screen.getByRole("list", {
      name: "tasks:releases.masterplanning.label",
    });
    expect(
      within(timeline)
        .getAllByRole("region")
        .map((group) => group.getAttribute("aria-label")),
    ).toEqual(["future", "active", "past", "tasks:releases.none"]);
    expect(
      within(screen.getByRole("region", { name: "active" }))
        .getAllByRole("listitem")
        .map((row) => row.getAttribute("data-milestone-id")),
    ).toEqual(["First", "Second", "Later"]);
    expect(
      within(
        screen.getByRole("region", { name: "tasks:releases.none" }),
      ).getByText("Unassigned"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "tasks:releases.none" }),
      ).queryByText("Missing release"),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", {
          name: "tasks:releases.masterplanning.unresolvedTitle",
        }),
      ).getByText("Missing release"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("tasks:releases.masterplanning.noMilestones"),
    ).toHaveLength(2);
    expect(mocks.query).toHaveBeenCalledWith("p");
    expect(mocks.board).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("keeps only release destinations during initial loading and retries metadata failures", () => {
    data = undefined;
    const { rerender } = render(<View />);
    expect(screen.getByText("tasks:milestones.loading")).toBeInTheDocument();
    expect(
      screen.queryByText("tasks:releases.masterplanning.noMilestones"),
    ).not.toBeInTheDocument();
    error = new Error("offline");
    rerender(<View />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.retry" }),
    );
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.masterplanning.loadError",
    );
  });
  it("retains cached rows and movement during a background refresh failure, but hides private cached rows on 403", () => {
    data = [milestone("Cached", "active")];
    error = new Error("offline");
    const { rerender } = render(<View />);
    expect(screen.getByText("Cached")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move Cached" }),
    ).toBeInTheDocument();
    error = new HttpError(403, "Forbidden");
    rerender(<View />);
    expect(screen.queryByText("Cached")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.masterplanning.noAccess",
    );
  });
  it("routes menu and drag moves through the same guarded release-only callback", async () => {
    data = [milestone("Core", "active")];
    render(<View />);
    fireEvent.click(screen.getByRole("button", { name: "Move Core" }));
    expect(mocks.move).toHaveBeenLastCalledWith("Core", "future");
    fireEvent.click(screen.getByRole("button", { name: "Unassign Core" }));
    expect(mocks.move).toHaveBeenLastCalledWith("Core", null);
    mocks.dnd.onDragEnd({
      active: { id: "Core" },
      over: { data: { current: { releaseId: "past" } } },
    });
    expect(mocks.move).toHaveBeenLastCalledWith("Core", "past");
    const calls = mocks.move.mock.calls.length;
    mocks.dnd.onDragEnd({
      active: { id: "Core" },
      over: { data: { current: { releaseId: "deleted" } } },
    });
    mocks.dnd.onDragEnd({ active: { id: "Core" }, over: null });
    expect(mocks.move).toHaveBeenCalledTimes(calls);
  });
  it("restores menu movement focus to the milestone title in its destination group", async () => {
    data = [milestone("Moving focus", "active")];
    mocks.move.mockImplementation(
      async (id: string, releaseId: string | null) => {
        data = data?.map((item) =>
          item.id === id ? { ...item, releaseId } : item,
        );
        return true;
      },
    );
    render(<View />);
    fireEvent.click(screen.getByRole("button", { name: "Move Moving focus" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Moving focus" }),
      ).toHaveFocus(),
    );
    expect(
      within(screen.getByRole("region", { name: "future" })).getByRole(
        "button",
        { name: "Moving focus" },
      ),
    ).toHaveFocus();
    expect(
      within(screen.getByRole("region", { name: "active" })).queryByText(
        "Moving focus",
      ),
    ).not.toBeInTheDocument();
  });
  it("opens milestone creation with the chosen release context and clears it on cancellation", () => {
    render(<View />);
    fireEvent.click(
      within(screen.getByRole("region", { name: "future" })).getByRole(
        "button",
        {
          name: "tasks:milestones.add",
        },
      ),
    );
    const dialog = screen.getByRole("dialog", { name: "Create milestone" });
    expect(dialog).toHaveAttribute("data-project-id", "p");
    expect(dialog).toHaveAttribute("data-release-id", "future");
    fireEvent.click(screen.getByRole("button", { name: "Cancel milestone" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("region", { name: "active" })).getByRole(
        "button",
        {
          name: "tasks:milestones.add",
        },
      ),
    );
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-release-id",
      "active",
    );
  });
  it("can create an unassigned milestone without project-management or Task/Bug creation permission", () => {
    render(<View />);
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "tasks:releases.none" }),
      ).getByRole("button", {
        name: "tasks:milestones.add",
      }),
    );
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-release-id",
      "none",
    );
  });
  it("hides milestone creation while initial metadata loads or access is forbidden", () => {
    data = undefined;
    const { rerender } = render(<View />);
    expect(
      screen.queryByRole("button", { name: "tasks:milestones.add" }),
    ).not.toBeInTheDocument();
    data = [];
    error = new HttpError(403, "Forbidden");
    rerender(<View />);
    expect(
      screen.queryByRole("button", { name: "tasks:milestones.add" }),
    ).not.toBeInTheDocument();
  });
  it("read-only users can browse without move handles, creation actions or drop help", () => {
    data = [milestone("Read only", "active")];
    render(<View canMove={false} />);
    expect(screen.getByText("Read only")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move Read only" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("tasks:releases.masterplanning.dragHelp"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "tasks:milestones.add" }),
    ).not.toBeInTheDocument();
    mocks.dnd.onDragEnd({
      active: { id: "Read only" },
      over: { data: { current: { releaseId: null } } },
    });
    expect(mocks.move).not.toHaveBeenCalled();
  });
  it("loads member names only when needed and resolves the lead without fetching work", () => {
    const { rerender } = render(<View />);
    expect(mocks.members).toHaveBeenLastCalledWith({
      workspaceId: "w",
      projectId: "p",
      enabled: false,
    });
    data = [{ ...milestone("Led milestone", "active"), leadId: "lead" }];
    rerender(<View />);
    expect(mocks.members).toHaveBeenLastCalledWith({
      workspaceId: "w",
      projectId: "p",
      enabled: true,
    });
    expect(screen.getByText("Max")).toBeInTheDocument();
  });
  it("waits for metadata then scrolls to the active release once without changing focus or jumping on refresh", () => {
    geometry();
    data = undefined;
    const { rerender } = render(<View />);
    expect(scroll).not.toHaveBeenCalled();
    data = [];
    rerender(<View />);
    const viewport = screen.getByRole("list", {
      name: "tasks:releases.masterplanning.label",
    }).parentElement!;
    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      top: 80,
      behavior: "instant",
    });
    expect(screen.getByRole("link", { name: "active" })).not.toHaveFocus();
    viewport.scrollTop = 500;
    data = [milestone("Fresh", "active")];
    rerender(
      <View items={releases.map((item) => ({ ...item }))} today="2026-10-23" />,
    );
    expect(scroll).toHaveBeenCalledOnce();
    expect(viewport.scrollTop).toBe(500);
  });
});
