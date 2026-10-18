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
  createTask: vi.fn(),
  progressSection: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "count" in options ? `${key}:${options.count}` : key,
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
  default: (props: { open: boolean; releaseId?: string }) => {
    if (props.open) m.createTask(props.releaseId);
    return props.open ? <div role="dialog" aria-label="create-task" /> : null;
  },
}));
vi.mock("../dialog/release-dialog", () => ({ ReleaseDialog: () => null }));
vi.mock("../delete-release-dialog", () => ({
  DeleteReleaseDialog: () => null,
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
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({ ...m.board, refetch: vi.fn() }),
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => m.today,
}));
vi.mock("../use-release-permissions", () => ({
  useReleasePermissions: () => ({
    canManage: true,
    canMoveItems: true,
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
    tasks: { total: 0, completed: 0 },
    features: { total: 0, completed: 0 },
    unfinished: 0,
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
  m.createTask.mockClear();
  m.progressSection.mockClear();
});

afterEach(cleanup);

describe("ReleaseDetailPage", () => {
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
      within(search).getByText("tasks:releases.detail.featureElsewhere"),
    ).toBeInTheDocument();
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
        features: 1,
        completedFeatures: 0,
        unfinished: 4,
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
    ).toHaveTextContent("4");
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

  it("adds a task to the release from an empty release", () => {
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
      name: "tasks:releases.detail.addTask",
    });
    expect(toolbarButton).toBeInTheDocument();
    fireEvent.click(emptyButton);
    expect(m.createTask).toHaveBeenCalledWith("r1");
  });

  it("doesn't offer to add tasks without permission", () => {
    m.canCreateTasks = false;
    m.board = {
      ...m.board,
      data: {
        ...board,
        columns: board.columns.map((c) => ({ ...c, tasks: [] })),
      },
    };
    renderPage();

    expect(
      screen.queryByRole("button", { name: "tasks:releases.detail.addTask" }),
    ).toBeNull();
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
