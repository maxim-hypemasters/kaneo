import { cleanup, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useProjectWebSocket } from "./use-project-websocket";

const mocks = vi.hoisted(() => ({
  client: {
    getQueryCache: () => ({ findAll: () => [], subscribe: () => () => {} }),
    getQueryState: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    getQueriesData: vi.fn().mockReturnValue([]),
    invalidateQueries: vi.fn(),
    cancelQueries: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mocks.client,
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@kaneo/libs", () => ({ windowId: "test" }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "u" } } }) },
}));
vi.mock("@/fetchers/task/get-task", () => ({
  default: () => new Promise(() => {}),
}));
vi.mock("@/fetchers/label/get-labels-by-task", () => ({
  default: () => Promise.resolve([]),
}));
vi.mock("@/fetchers/external-link/get-external-links", () => ({
  default: () => Promise.resolve([]),
}));

class Socket {
  static current: Socket;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = vi.fn();
  constructor() {
    Socket.current = this;
  }
  message(type: string, rest: Record<string, unknown> = {}) {
    this.onmessage?.({
      data: JSON.stringify({ type, projectId: "p", ...rest }),
    });
  }
}

const releaseCalls = () =>
  mocks.client.invalidateQueries.mock.calls.filter(
    ([filters]) =>
      filters?.queryKey?.[0] === "releases" && filters.queryKey[1] === "p",
  );
// Invalidations that read the list again, and those that only mark it stale.
const releasesRefreshes = () =>
  releaseCalls().filter(([filters]) => filters.refetchType !== "none").length;
const releasesMarkedStale = () =>
  releaseCalls().filter(([filters]) => filters.refetchType === "none").length;

let releasesState: { dataUpdatedAt: number; fetchStatus: string } | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  mocks.client.getQueryData.mockReturnValue({
    id: "p",
    columns: [{ id: "todo", slug: "todo", tasks: [] }],
    plannedTasks: [],
    archivedTasks: [],
  });
  releasesState = undefined;
  mocks.client.getQueryState.mockImplementation((queryKey: string[]) =>
    queryKey[0] === "releases" ? releasesState : { fetchStatus: "idle" },
  );
  mocks.client.invalidateQueries.mockReset();
  mocks.client.setQueryData.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("release list realtime", () => {
  it("refreshes only the release list on RELEASES_UPDATED", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("RELEASES_UPDATED");
    vi.advanceTimersByTime(300);
    expect(mocks.client.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["releases", "p"] }],
    ]);
    expect(mocks.client.setQueryData).not.toHaveBeenCalled();
  });

  it.each([
    "TASK_UPDATED",
    "TASK_CREATED",
    "TASK_DELETED",
    "TASK_MOVED",
    "PROJECT_UPDATED",
  ])("only marks the release list stale on %s", (type) => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message(type, { taskId: "a" });
    vi.advanceTimersByTime(300);
    expect(releasesMarkedStale()).toBe(1);
    expect(releasesRefreshes()).toBe(0);
  });

  it("only marks it stale after a reorder, which can change statuses", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("TASKS_REORDERED", {
      tasks: [{ id: "a", position: 1, status: "todo" }],
    });
    vi.advanceTimersByTime(300);
    expect(releasesMarkedStale()).toBe(1);
    expect(releasesRefreshes()).toBe(0);
  });

  it.each(["TASK_LABEL_UPDATED", "COMMENT_UPDATED", "TASK_RELATION_UPDATED"])(
    "leaves it alone on %s",
    (type) => {
      renderHook(() => useProjectWebSocket("p"));
      Socket.current.message(type, { taskId: "a" });
      vi.advanceTimersByTime(300);
      expect(releaseCalls()).toEqual([]);
    },
  );

  it("shares one refresh across a burst of release messages", () => {
    renderHook(() => useProjectWebSocket("p"));
    for (const taskId of ["a", "b", "c", "d", "e", "f"]) {
      Socket.current.message("TASK_UPDATED", { taskId });
      Socket.current.message("RELEASES_UPDATED");
    }
    vi.advanceTimersByTime(300);
    expect(releasesRefreshes()).toBe(1);
    Socket.current.message("TASK_UPDATED", { taskId: "g" });
    vi.advanceTimersByTime(300);
    expect(releasesRefreshes()).toBe(1);
    Socket.current.message("RELEASES_UPDATED");
    vi.advanceTimersByTime(300);
    expect(releasesRefreshes()).toBe(2);
  });

  it("catches up when the socket opens", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.onopen?.();
    expect(releaseCalls()).toEqual([
      [{ queryKey: ["releases", "p"] }, { cancelRefetch: false }],
    ]);
  });

  it("skips that read when the view fetched the list a moment ago", () => {
    renderHook(() => useProjectWebSocket("p"));
    vi.advanceTimersByTime(100);
    releasesState = { dataUpdatedAt: Date.now(), fetchStatus: "idle" };
    vi.advanceTimersByTime(4_000);
    Socket.current.onopen?.();
    vi.advanceTimersByTime(300);
    expect(releasesRefreshes()).toBe(0);
  });

  it("reads a list fetched a while ago again", () => {
    renderHook(() => useProjectWebSocket("p"));
    releasesState = { dataUpdatedAt: Date.now(), fetchStatus: "idle" };
    vi.advanceTimersByTime(5_000);
    Socket.current.onopen?.();
    expect(releasesRefreshes()).toBe(1);
  });

  it("reads it again after reconnecting, though it was fetched recently", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.onopen?.();
    releasesState = { dataUpdatedAt: Date.now(), fetchStatus: "idle" };
    mocks.client.invalidateQueries.mockClear();
    vi.advanceTimersByTime(1_000);
    // Release messages sent while it was down are not replayed.
    Socket.current.onclose?.();
    vi.advanceTimersByTime(1_000);
    Socket.current.onopen?.();
    expect(releasesRefreshes()).toBe(1);
  });

  it("drops a pending refresh when the project closes", () => {
    const { unmount } = renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("RELEASES_UPDATED");
    unmount();
    vi.advanceTimersByTime(300);
    expect(releasesRefreshes()).toBe(0);
  });
});
