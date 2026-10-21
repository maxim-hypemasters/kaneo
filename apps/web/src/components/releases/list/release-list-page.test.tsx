import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
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
import getTasks from "@/fetchers/task/get-tasks";
import getReleaseProgress from "@/fetchers/release/get-release-progress";
import type { Release } from "@/types/release";
import { ReleaseListPage } from "./release-list-page";

const m = vi.hoisted(() => ({
  releases: {
    data: undefined as Release[] | undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  permissions: {
    canManage: true,
    canMoveItems: true,
    canDelete: true,
    canCreateTasks: true,
  },
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
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => (
    <a
      className={className}
      href={Object.entries(params).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/common/project-layout", () => ({
  default: (props: {
    toolbar?: ReactNode;
    summary?: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <div data-testid="toolbar">{props.toolbar}</div>
      <div data-testid="summary">{props.summary}</div>
      {props.children}
    </div>
  ),
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { name: "Web" } }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  releasesKey: (projectId: string) => ["releases", projectId],
  useGetReleases: () => m.releases,
}));
// The real useGetTasks loads the board through this; it stays loading unless
// a test gives it a board.
vi.mock("@/fetchers/task/get-tasks", () => ({
  default: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/fetchers/release/get-release-progress", () => ({
  default: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-10-17",
}));
vi.mock("../use-release-permissions", () => ({
  useReleasePermissions: () => m.permissions,
}));
vi.mock("../dialog/release-dialog", () => ({
  ReleaseDialog: (props: { open: boolean; release: Release | null }) =>
    props.open ? (
      <div role="dialog" aria-label="release-form">
        {props.release?.name ?? "new"}
      </div>
    ) : null,
}));
vi.mock("../delete-release-dialog", () => ({
  DeleteReleaseDialog: (props: {
    open: boolean;
    release: Release | null;
    itemCount: number;
  }) =>
    props.open ? (
      <div role="dialog" aria-label="delete-release">
        {props.release?.name} {props.itemCount}
      </div>
    ) : null,
}));
vi.mock("../move-unfinished-dialog", () => ({
  MoveUnfinishedDialog: (props: { open: boolean; unfinished: number }) =>
    props.open ? (
      <div role="dialog" aria-label="move-unfinished">
        {props.unfinished}
      </div>
    ) : null,
}));

const release = (
  id: string,
  startDate: string,
  codeFreezeDate: string,
  submissionDate: string,
  unfinished = 2,
): Release => ({
  id,
  projectId: "project-1",
  name: `Release ${id}`,
  description: null,
  startDate,
  codeFreezeDate,
  submissionDate,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progress: {
    tasks: { total: 5, completed: 3 },
    features: { total: 1, completed: 0 },
    unfinished,
  },
});

const active = release("a", "2026-10-01", "2026-10-15", "2026-10-20");
const upcoming = release("u", "2026-11-01", "2026-11-15", "2026-11-20");
const past = release("p", "2026-09-01", "2026-09-10", "2026-09-12", 0);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ReleaseListPage workspaceId="workspace-1" projectId="project-1" />
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.releases = {
    data: [past, active, upcoming],
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
  m.permissions = {
    canManage: true,
    canMoveItems: true,
    canDelete: true,
    canCreateTasks: true,
  };
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("ReleaseListPage", () => {
  it("lists future, active and past rows and loads history only for active releases", async () => {
    renderPage();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["Release u", "Release a", "Release p"],
    );
    const link = screen.getByRole("link", { name: "Release a" });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace-1/project/project-1/releases/a",
    );
    expect(
      screen.getByText("tasks:releases.phase.codeFreeze"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /timeline\.(expand|collapse)/ }),
    ).not.toBeInTheDocument();
    await act(async () => {});
    expect(getReleaseProgress).toHaveBeenCalledExactlyOnceWith(
      "a",
      expect.any(String),
    );
    expect(screen.getByTestId("summary")).toHaveTextContent(
      "tasks:releases.count:3",
    );
  });

  it("keeps upcoming and past releases compact when none are active", () => {
    m.releases.data = [past, upcoming];
    renderPage();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(getReleaseProgress).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Release p" })).toBeInTheDocument();
  });

  it("loads all overlapping active histories, including both active phases", async () => {
    const inProgress = release("b", "2026-10-10", "2026-10-19", "2026-10-28");
    m.releases.data = [past, active, upcoming, inProgress];
    renderPage();
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(
      screen.getByText("tasks:releases.phase.inProgress"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("tasks:releases.phase.codeFreeze"),
    ).toBeInTheDocument();
    await act(async () => {});
    expect(vi.mocked(getReleaseProgress).mock.calls.map(([id]) => id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("recomputes chart visibility after deletion and subsequent release data arrives", async () => {
    m.releases.data = [active];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const page = () => (
      <QueryClientProvider client={queryClient}>
        <ReleaseListPage workspaceId="workspace-1" projectId="project-1" />
      </QueryClientProvider>
    );
    const { rerender } = render(page());
    m.releases.data = [];
    rerender(page());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    m.releases.data = [upcoming];
    rerender(page());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    m.releases.data = [
      upcoming,
      release("new-active", "2026-10-10", "2026-10-19", "2026-10-28"),
    ];
    rerender(page());
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await act(async () => {});
    expect(vi.mocked(getReleaseProgress).mock.calls.map(([id]) => id)).toEqual([
      "a",
      "new-active",
    ]);
  });

  it("reads progress for screen readers and shows the counts", () => {
    m.releases.data = [active];
    renderPage();

    expect(
      screen.getByRole("img", {
        name: "tasks:releases.timeline.completion:60:3/5",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("tasks:releases.counts.features:1"),
    ).toBeInTheDocument();
  });

  it("uses complete API execution counts without downloading the task board", () => {
    m.releases.data = [active];
    renderPage();
    expect(
      screen.getByRole("img", {
        name: "tasks:releases.timeline.completion:60:3/5",
      }),
    ).toBeInTheDocument();
    expect(getTasks).not.toHaveBeenCalled();
  });

  it("opens the create, edit, delete and move dialogs", async () => {
    m.releases.data = [active];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "tasks:releases.new" }));
    expect(
      screen.getByRole("dialog", { name: "release-form" }),
    ).toHaveTextContent("new");

    const menu = screen.getByRole("button", {
      name: "tasks:releases.pages.actionsFor",
    });
    for (const [item, dialog, text] of [
      ["tasks:releases.edit", "release-form", "Release a"],
      ["tasks:releases.moveUnfinished.action", "move-unfinished", "2"],
      ["tasks:releases.delete", "delete-release", "Release a 5"],
    ] as const) {
      await act(async () => {
        fireEvent.click(menu);
      });
      await act(async () => {
        fireEvent.click(await screen.findByRole("menuitem", { name: item }));
      });
      expect(screen.getByRole("dialog", { name: dialog })).toHaveTextContent(
        text,
      );
    }
  });

  it("offers only what the viewer may do", () => {
    m.permissions = {
      canManage: false,
      canMoveItems: false,
      canDelete: false,
      canCreateTasks: true,
    };
    m.releases.data = [active];
    renderPage();

    expect(
      screen.queryByRole("button", { name: "tasks:releases.new" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "tasks:releases.pages.actionsFor",
      }),
    ).toBeNull();
  });

  it("invites a manager to plan the first release", () => {
    m.releases.data = [];
    renderPage();

    expect(
      screen.getByText("tasks:releases.empty.description"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(
        screen
          .getByText("tasks:releases.empty.title")
          .closest("[data-slot=empty]") as HTMLElement,
      ).getByRole("button", { name: "tasks:releases.new" }),
    );
    expect(
      screen.getByRole("dialog", { name: "release-form" }),
    ).toBeInTheDocument();
  });

  it("tells a member where releases will show", () => {
    m.permissions = { ...m.permissions, canManage: false, canDelete: false };
    m.releases.data = [];
    renderPage();

    expect(
      screen.getByText("tasks:releases.empty.readOnly"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a retry when the releases can't load", () => {
    m.releases = { ...m.releases, data: undefined, isError: true };
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.loadError",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.retry" }),
    );
    expect(m.releases.refetch).toHaveBeenCalled();
  });

  it("shows a loading state first", () => {
    m.releases = { ...m.releases, data: undefined };
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "tasks:releases.pages.loading",
    );
  });
});
