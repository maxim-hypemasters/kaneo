import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Release } from "@/types/release";
import type Task from "@/types/task";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import type { ReleaseMilestoneMetadata as ReleaseMilestone } from "./release-milestone-groups";
import { ReleaseDetailPage } from "./release-detail-page";

const m = vi.hoisted(() => ({
  releases: { data: undefined as unknown, isError: false, isFetching: false },
  board: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    isFetching: false,
  },
  today: "2026-10-17",
  canCreateTasks: true,
  canMoveItems: true,
  createTask: vi.fn(),
  progressSection: vi.fn(),
  milestones: {
    data: [] as ReleaseMilestone[] | undefined,
    isError: false,
    isFetching: false,
  },
  workflow: {
    data: undefined as
      | Array<{ id: string; slug: string; position: number; isFinal: boolean }>
      | undefined,
    isError: false,
    isFetching: false,
  },
  refetchMilestones: vi.fn(),
  refetchWorkflow: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "count" in options
        ? `${key}:${options.count}`
        : options && "percentage" in options
          ? `${key}:${options.percentage}:${options.completed}/${options.total}`
          : key,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    search,
    children,
    className,
    ...rest
  }: {
    to: string;
    params: Record<string, string>;
    search?: { taskId: string };
    children: ReactNode;
    className?: string;
  }) => {
    const path = Object.entries(params).reduce(
      (current, [key, value]) => current.replace(`$${key}`, value),
      to,
    );
    return (
      <a
        className={className}
        href={search ? `${path}?taskId=${search.taskId}` : path}
        {...rest}
      >
        {children}
      </a>
    );
  },
}));
vi.mock("@/components/common/project-layout", () => ({
  default: (props: { toolbar?: ReactNode; children: ReactNode }) => (
    <div>
      <div data-testid="toolbar">{props.toolbar}</div>
      {props.children}
    </div>
  ),
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/task/task-details-sheet", () => ({
  default: (props: { taskId?: string }) =>
    props.taskId ? (
      <div role="dialog" aria-label={`sheet-${props.taskId}`} />
    ) : null,
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: (props: {
    open: boolean;
    type?: string;
    projectId?: string;
    releaseId?: string;
    originReleaseId?: string;
  }) => {
    if (props.open) {
      m.createTask({
        type: props.type,
        projectId: props.projectId,
        releaseId: props.releaseId,
        originReleaseId: props.originReleaseId,
      });
    }
    return props.open ? (
      <div role="dialog" aria-label={`create-${props.type}`} />
    ) : null;
  },
}));
vi.mock("../dialog/release-dialog", () => ({ ReleaseDialog: () => null }));
vi.mock("../delete-release-dialog", () => ({
  DeleteReleaseDialog: () => null,
}));
vi.mock("./release-link-dialog", () => ({
  ReleaseLinkDialog: ({
    kind,
    releaseId,
  }: {
    kind: string;
    releaseId: string;
  }) => <div role="dialog" aria-label={`link-${kind}-${releaseId}`} />,
}));
vi.mock("../move-unfinished-dialog", () => ({
  MoveUnfinishedDialog: (props: { open: boolean; unfinished: number }) =>
    props.open ? (
      <div role="dialog" aria-label="move-unfinished">
        {props.unfinished}
      </div>
    ) : null,
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  releasesKey: (projectId: string) => ["releases", projectId],
  useGetReleases: () => ({ ...m.releases, refetch: vi.fn() }),
}));
vi.mock("./release-progress-section", () => ({
  ReleaseProgressSection: (props: {
    release: Release;
    counts: ReleaseItemCounts;
    today: string;
  }) => {
    m.progressSection(props);
    return <section aria-label="progress-history">{props.release.id}</section>;
  },
}));
vi.mock("@/hooks/queries/task/use-get-project-features", () => ({
  useGetProjectFeatures: () => ({
    data: (
      (m.board.data as { columns?: Array<{ tasks: Task[] }> })?.columns ?? []
    )
      .flatMap((column) => column.tasks)
      .filter((task) => task.type === "feature"),
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({ ...m.board, refetch: vi.fn() }),
}));
vi.mock("@/hooks/queries/release/use-get-release-milestones", () => ({
  useGetReleaseMilestones: () => ({
    ...m.milestones,
    refetch: m.refetchMilestones,
  }),
}));
vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({ ...m.workflow, refetch: m.refetchWorkflow }),
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => m.today,
}));
vi.mock("../use-release-permissions", () => ({
  useReleasePermissions: () => ({
    canManage: true,
    canMoveItems: m.canMoveItems,
    canDelete: true,
    canCreateTasks: m.canCreateTasks,
  }),
}));

const release: Release = {
  id: "r1",
  projectId: "project-1",
  name: "2.4",
  description: "Checkout rework",
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progress: {
    tasks: { total: 4, completed: 1 },
    features: { total: 2, completed: 0 },
    milestones: { total: 0, completed: 0 },
    unfinished: 3,
  },
};

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    status: "to-do",
    projectId: "project-1",
    type: "task",
    featureId: null,
    milestoneId: null,
    releaseId: "r1",
    ...values,
  }) as Task;

const board = {
  slug: "WEB",
  name: "Web",
  columns: [
    {
      id: "to-do",
      slug: "to-do",
      name: "To Do",
      isFinal: false,
      icon: null,
      tasks: [
        task("Checkout", { type: "feature" }),
        task("Pay", { featureId: "Checkout", number: 7 }),
        task("Search", { type: "feature", releaseId: "r2" }),
        task("Index", { featureId: "Search" }),
        task("Rank", { featureId: "Search", releaseId: null }),
        task("Loose"),
      ],
    },
    {
      id: "done",
      slug: "done",
      name: "Done",
      isFinal: true,
      icon: null,
      tasks: [task("Shipped", { status: "done" })],
    },
  ],
  plannedTasks: [],
  archivedTasks: [],
};

function renderPage(taskId?: string) {
  const queryClient = new QueryClient();
  // useGetTasks is mocked; the real one fills this cache entry.
  if (m.board.data) {
    queryClient.setQueryData(["tasks", "project-1"], m.board.data);
  }
  render(
    <QueryClientProvider client={queryClient}>
      <ReleaseDetailPage
        workspaceId="workspace-1"
        projectId="project-1"
        releaseId="r1"
        taskId={taskId}
        onCloseTask={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  m.releases = { data: [release], isError: false, isFetching: false };
  m.board = {
    data: board,
    isPending: false,
    isError: false,
    isFetching: false,
  };
  m.today = "2026-10-17";
  m.canCreateTasks = true;
  m.canMoveItems = true;
  m.createTask.mockClear();
  m.progressSection.mockClear();
  m.milestones = { data: [], isError: false, isFetching: false };
  m.workflow = {
    data: board.columns.map((column, position) => ({
      ...column,
      id: `column-${column.slug}`,
      position,
    })),
    isError: false,
    isFetching: false,
  };
  m.refetchMilestones.mockClear();
  m.refetchWorkflow.mockClear();
});

afterEach(cleanup);

describe("ReleaseDetailPage", () => {
  function milestoneBoard() {
    const copy = structuredClone(board);
    copy.columns[0].tasks.find((item) => item.id === "Pay")!.milestoneId = "m1";
    copy.columns[1].tasks.push(
      task("Fixed bug", {
        type: "bug",
        featureId: "Checkout",
        status: "done",
        milestoneId: null,
      }),
    );
    m.board.data = copy;
    m.milestones.data = [
      {
        id: "empty",
        featureId: "Checkout",
        title: "Empty milestone",
        position: 0,
      },
      {
        id: "m1",
        featureId: "Checkout",
        title: "First milestone",
        position: 1,
      },
    ];
  }

  it("shows release-scoped Feature and nested milestone counters", () => {
    milestoneBoard();
    renderPage();
    const feature = screen.getByRole("region", { name: "Checkout" });
    expect(
      within(feature).getByRole("img", {
        name: "tasks:releases.detail.progressInRelease:50:1/2",
      }),
    ).toBeVisible();
    expect(
      within(feature).getByRole("region", { name: "First milestone" }),
    ).toHaveTextContent("0% · 0/1");
    expect(
      within(feature).getByRole("region", { name: "tasks:milestones.none" }),
    ).toHaveTextContent("100% · 1/1");
    expect(
      within(feature).queryByRole("heading", { name: "Empty milestone" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Search" })).toHaveTextContent(
      "0% · 0/1",
    );
  });

  it("retains task rows while milestone metadata loads", () => {
    milestoneBoard();
    m.milestones = { data: undefined, isError: false, isFetching: true };
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(
      "tasks:milestones.loading",
    );
    const feature = screen.getByRole("region", { name: "Checkout" });
    expect(within(feature).getByRole("link", { name: /Pay/ })).toBeVisible();
    expect(
      within(feature).getByRole("link", { name: /Fixed bug/ }),
    ).toBeVisible();
    expect(
      within(feature).queryByRole("heading", { level: 4 }),
    ).not.toBeInTheDocument();
  });

  it("offers retry and keeps cached grouping after a refresh error", () => {
    milestoneBoard();
    m.milestones.isError = true;
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.detail.groupingLoadError",
    );
    expect(
      screen.getByRole("heading", { name: "First milestone" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(m.refetchMilestones).toHaveBeenCalledOnce();
    expect(m.refetchWorkflow).toHaveBeenCalledOnce();
  });

  it("does not show partial denominators while initial board pages load", () => {
    milestoneBoard();
    m.board.isPending = true;
    m.board.isFetching = true;
    renderPage();
    const feature = screen.getByRole("region", { name: "Checkout" });
    expect(within(feature).getByRole("link", { name: /Pay/ })).toBeVisible();
    expect(
      within(feature).queryByRole("img", { name: /progressInRelease/ }),
    ).not.toBeInTheDocument();
    expect(
      within(feature).getAllByRole("status", {
        name: "tasks:releases.detail.progressLoading",
      }),
    ).toHaveLength(3);
  });

  it("retains flat work and retry feedback when metadata is unavailable", () => {
    milestoneBoard();
    m.milestones = { data: undefined, isError: true, isFetching: false };
    renderPage();
    const feature = screen.getByRole("region", { name: "Checkout" });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(within(feature).getByRole("link", { name: /Pay/ })).toBeVisible();
    expect(
      within(feature).queryByRole("heading", { level: 4 }),
    ).not.toBeInTheDocument();
    expect(
      within(feature).getByRole("img", { name: /progressInRelease:50:1\/2/ }),
    ).toBeVisible();
  });

  it("offers retry and progress placeholders if workflow definitions are unavailable", () => {
    m.workflow = { data: undefined, isError: true, isFetching: false };
    renderPage();
    expect(screen.getByRole("alert")).toBeVisible();
    const feature = screen.getByRole("region", { name: "Checkout" });
    expect(
      within(feature).getByRole("status", {
        name: "tasks:releases.detail.progressLoading",
      }),
    ).toBeVisible();
    expect(within(feature).getByRole("link", { name: /Pay/ })).toBeVisible();
  });

  it("shows the release with its features, then the tasks without one", () => {
    renderPage();

    expect(
      screen.getByRole("region", { name: "progress-history" }),
    ).toHaveTextContent("r1");

    expect(
      screen.getByRole("heading", { level: 1, name: "2.4" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Checkout rework")).toBeInTheDocument();
    expect(
      screen.getByText("tasks:releases.phase.codeFreeze"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "tasks:releases.detail.back" }),
    ).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace-1/project/project-1/releases",
    );

    const checkout = screen.getByRole("region", { name: "Checkout" });
    expect(within(checkout).getByRole("link", { name: /Pay/ })).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace-1/project/project-1/releases/r1?taskId=Pay",
    );
    expect(within(checkout).getByText("WEB-7")).toBeInTheDocument();

    const search = screen.getByRole("region", { name: "Search" });
    expect(
      within(search).queryByText("tasks:releases.detail.featureElsewhere"),
    ).toBeNull();
    expect(
      within(search).getByText("tasks:releases.detail.tasksElsewhere:1"),
    ).toBeInTheDocument();
    expect(within(search).queryByRole("link", { name: /Rank/ })).toBeNull();

    const standalone = screen.getByRole("region", {
      name: "tasks:releases.detail.standaloneHeading",
    });
    const rows = within(standalone).getAllByRole("link");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Loose"),
      expect.stringContaining("Shipped"),
    ]);
    expect(rows[1]).toHaveAttribute("data-task-id", "Shipped");
  });

  it("gives the unified progress section board counts and today's local date", () => {
    renderPage();

    expect(m.progressSection).toHaveBeenCalledWith({
      release,
      counts: {
        tasks: 4,
        completedTasks: 1,
        features: 2,
        completedFeatures: 0,
        milestones: 0,
        completedMilestones: 0,
        unfinished: 3,
      },
      today: "2026-10-17",
    });
    expect(
      screen.getAllByRole("region", { name: "progress-history" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("region", {
        name: "tasks:releases.detail.timelineLabel",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/^tasks:releases.progressAria/),
    ).not.toBeInTheDocument();
  });

  it("puts Move unfinished up front from code freeze on", () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:releases.moveUnfinished.action",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "move-unfinished" }),
    ).toHaveTextContent("3");
  });

  it("keeps Move unfinished in the menu while work is in progress", () => {
    m.today = "2026-10-05";
    renderPage();

    expect(
      screen.queryByRole("button", {
        name: "tasks:releases.moveUnfinished.action",
      }),
    ).toBeNull();
    expect(
      screen.getByText("tasks:releases.phase.inProgress"),
    ).toBeInTheDocument();
  });

  it.each([
    ["task", "newTask"],
    ["feature", "newFeature"],
    ["bug", "newBug"],
  ])("creates a %s in the release from the toolbar", async (type, item) => {
    renderPage();

    fireEvent.click(
      within(screen.getByTestId("toolbar")).getByRole("button", {
        name: "tasks:createMenu.label",
      }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: `tasks:createMenu.${item}` }),
    );
    expect(m.createTask).toHaveBeenCalledWith({
      type,
      projectId: "project-1",
      releaseId: type === "feature" ? undefined : "r1",
      originReleaseId: "r1",
    });
    expect(
      screen.getByRole("dialog", { name: `create-${type}` }),
    ).toBeInTheDocument();
  });

  it.each([
    ["task", "newTask"],
    ["feature", "newFeature"],
    ["bug", "newBug"],
  ])("creates a %s from the empty release action", async (type, item) => {
    m.board = {
      ...m.board,
      data: {
        ...board,
        columns: board.columns.map((c) => ({ ...c, tasks: [] })),
      },
    };
    renderPage();

    expect(screen.getByText("tasks:releases.detail.empty")).toBeInTheDocument();
    const [toolbarButton, emptyButton] = screen.getAllByRole("button", {
      name: "tasks:createMenu.label",
    });
    expect(toolbarButton).toBeInTheDocument();
    fireEvent.click(emptyButton);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: `tasks:createMenu.${item}` }),
    );
    expect(m.createTask).toHaveBeenCalledWith({
      type,
      projectId: "project-1",
      releaseId: type === "feature" ? undefined : "r1",
      originReleaseId: "r1",
    });
  });

  it("doesn't offer to add tasks without permission", () => {
    m.canCreateTasks = false;
    m.canMoveItems = false;
    m.board = {
      ...m.board,
      data: {
        ...board,
        columns: board.columns.map((c) => ({ ...c, tasks: [] })),
      },
    };
    renderPage();

    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeNull();
  });

  it.each(["task", "milestone"] as const)(
    "opens the %s linking dialog from the toolbar without create permission",
    async (kind) => {
      m.canCreateTasks = false;
      renderPage();
      fireEvent.click(
        within(screen.getByTestId("toolbar")).getByRole("button", {
          name: "tasks:createMenu.label",
        }),
      );
      expect(
        screen.queryByRole("menuitem", { name: "tasks:createMenu.newTask" }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        await screen.findByRole("menuitem", {
          name:
            kind === "task"
              ? "tasks:releases.link.taskAction"
              : "tasks:releases.link.milestoneAction",
        }),
      );
      expect(
        screen.getByRole("dialog", { name: `link-${kind}-r1` }),
      ).toBeInTheDocument();
      expect(m.createTask).not.toHaveBeenCalled();
    },
  );

  it("offers linking in the empty state independently of creation", async () => {
    m.canCreateTasks = false;
    m.board = {
      ...m.board,
      data: {
        ...board,
        columns: board.columns.map((column) => ({ ...column, tasks: [] })),
      },
    };
    renderPage();
    const [, emptyButton] = screen.getAllByRole("button", {
      name: "tasks:createMenu.label",
    });
    fireEvent.click(emptyButton);
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "tasks:releases.link.milestoneAction",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "link-milestone-r1" }),
    ).toBeInTheDocument();
  });

  it("keeps creation available without offering links to users lacking update permission", async () => {
    m.canMoveItems = false;
    renderPage();
    fireEvent.click(
      within(screen.getByTestId("toolbar")).getByRole("button", {
        name: "tasks:createMenu.label",
      }),
    );
    expect(await screen.findAllByRole("menuitem")).toHaveLength(3);
    expect(
      screen.queryByRole("menuitem", {
        name: "tasks:releases.link.taskAction",
      }),
    ).not.toBeInTheDocument();
  });

  it("waits for the board before showing the items", () => {
    m.board = {
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
    };
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "2.4" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "tasks:releases.detail.loadingTasks",
    );
  });

  it("says when the board can't load", () => {
    m.board = {
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
    };
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.pages.tasksLoadError",
    );
  });

  it("says when the release is gone", () => {
    m.releases = { data: [], isError: false, isFetching: false };
    renderPage();

    expect(
      screen.getByText("tasks:releases.detail.notFound"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "tasks:releases.detail.backToReleases",
      }),
    ).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace-1/project/project-1/releases",
    );
  });

  it("opens a task's sheet from the search", () => {
    renderPage("Pay");

    expect(
      screen.getByRole("dialog", { name: "sheet-Pay" }),
    ).toBeInTheDocument();
  });
});
