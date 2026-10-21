import { cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useProjectWebSocket } from "./use-project-websocket";
import {
  finalStatuses,
  startedStatuses,
} from "@/lib/releases/release-progress";

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
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
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
const progressCalls = () =>
  mocks.client.invalidateQueries.mock.calls.filter(
    ([filters]) =>
      filters?.queryKey?.[0] === "release-progress" &&
      filters.queryKey[1] === "p",
  );
const columnCalls = () =>
  mocks.client.invalidateQueries.mock.calls.filter(
    ([filters]) => filters?.queryKey?.[0] === "columns",
  );
const candidateCalls = () =>
  mocks.client.invalidateQueries.mock.calls.filter(
    ([filters]) => filters?.queryKey?.[0] === "release-link-candidates",
  );
// Release execution totals are authoritative, including derived milestones.
const releasesRefreshes = () =>
  releaseCalls().filter(([filters]) => filters.refetchType !== "none").length;
const releasesMarkedStale = () =>
  releaseCalls().filter(([filters]) => filters.refetchType === "none").length;

let releasesState: { dataUpdatedAt: number; fetchStatus: string } | undefined;
let milestoneCache: QueryClient;
const releaseMilestoneKeys = [
  ["feature-milestones", "p", "release", "r"],
  ["feature-milestones", "p", "release", "another-release"],
];
const otherProjectMilestones = ["feature-milestones", "other", "release", "r"];
const candidateKeys = [
  ["feature-create-candidates", "p", "", 1],
  ["feature-create-candidates", "p", "Core", 2],
  ["release-link-candidates", "p", "r", "task", "", 1],
  ["release-link-candidates", "p", "another-release", "milestone", "Launch", 2],
];
const otherCandidateKey = [
  "release-link-candidates",
  "other",
  "r",
  "task",
  "",
  1,
];
function expectCandidatesInvalidated() {
  for (const key of candidateKeys)
    expect(milestoneCache.getQueryState(key)?.isInvalidated).toBe(true);
  expect(milestoneCache.getQueryState(otherCandidateKey)?.isInvalidated).toBe(
    false,
  );
}
const initialWorkflow = [
  { id: "a", slug: "todo", position: 0, isFinal: false },
  { id: "b", slug: "active", position: 1, isFinal: false },
  { id: "c", slug: "done", position: 2, isFinal: true },
];
function expectReleaseMilestonesInvalidated() {
  for (const key of releaseMilestoneKeys)
    expect(milestoneCache.getQueryState(key)?.isInvalidated).toBe(true);
  expect(
    milestoneCache.getQueryState(otherProjectMilestones)?.isInvalidated,
  ).toBe(false);
}

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
  milestoneCache = new QueryClient();
  for (const key of [...releaseMilestoneKeys, otherProjectMilestones])
    milestoneCache.setQueryData(key, []);
  for (const key of [...candidateKeys, otherCandidateKey])
    milestoneCache.setQueryData(key, []);
  milestoneCache.setQueryData(["columns", "p"], initialWorkflow);
  milestoneCache.setQueryData(["columns", "other"], initialWorkflow);
  mocks.client.invalidateQueries.mockImplementation((filters, options) =>
    milestoneCache.invalidateQueries(filters, options),
  );
  mocks.client.setQueryData.mockReset();
});
afterEach(() => {
  cleanup();
  milestoneCache.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("release list realtime", () => {
  it("refetches mounted linking candidates once for a mixed remote event burst", async () => {
    const read = vi.fn().mockResolvedValue([{ id: "available" }]);
    const observer = new QueryObserver(milestoneCache, {
      queryKey: candidateKeys[0],
      queryFn: read,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    renderHook(() => useProjectWebSocket("p"));
    for (const type of [
      "TASK_UPDATED",
      "TASK_MOVED",
      "MILESTONES_UPDATED",
      "RELEASES_UPDATED",
    ])
      Socket.current.message(type, { taskId: "a", featureId: "f" });
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(read).toHaveBeenCalledOnce();
    expect(candidateCalls()).toHaveLength(1);
    expect(observer.getCurrentResult().data).toEqual([{ id: "available" }]);
    expect(milestoneCache.getQueryState(candidateKeys[1])?.isInvalidated).toBe(
      true,
    );
    expect(milestoneCache.getQueryState(otherCandidateKey)?.isInvalidated).toBe(
      false,
    );
    unsubscribe();
  });
  it("refetches mounted release execution totals once after a remote task burst", async () => {
    const key = ["releases", "p"];
    milestoneCache.setQueryData(key, [{ id: "r", completedMilestones: 0 }]);
    const read = vi
      .fn()
      .mockResolvedValue([{ id: "r", completedMilestones: 1 }]);
    const observer = new QueryObserver(milestoneCache, {
      queryKey: key,
      queryFn: read,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    renderHook(() => useProjectWebSocket("p"));
    expect(read).not.toHaveBeenCalled();
    Socket.current.message("TASK_UPDATED", { taskId: "a", windowId: "other" });
    Socket.current.message("TASK_UPDATED", { taskId: "b", windowId: "other" });
    await vi.advanceTimersByTimeAsync(300);
    expect(read).toHaveBeenCalledOnce();
    expect(observer.getCurrentResult().data).toEqual([
      { id: "r", completedMilestones: 1 },
    ]);
    unsubscribe();
  });
  it("refreshes Feature-linked work and the library after coalesced task and label updates", () => {
    mocks.client.getQueryData.mockImplementation((key: unknown[]) =>
      key[0] === "project-features" ? [{ id: "f" }] : undefined,
    );
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("TASK_UPDATED", { taskId: "t" });
    Socket.current.message("TASK_LABEL_UPDATED", { taskId: "f" });
    vi.advanceTimersByTime(300);
    expect(mocks.client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["task-relations", "f"],
    });
    expect(mocks.client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["feature-library", "p"],
    });
    expect(
      mocks.client.invalidateQueries.mock.calls.filter(
        ([filters]) => filters?.queryKey?.[0] === "feature-library",
      ),
    ).toHaveLength(1);
  });
  const milestoneCalls = () =>
    mocks.client.invalidateQueries.mock.calls.filter(
      ([filters]) => filters?.queryKey?.[0] === "feature-milestones",
    );
  it("coalesces milestone, task and workflow messages", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("MILESTONES_UPDATED", { featureId: "f" });
    Socket.current.message("TASK_CREATED", { taskId: "a" });
    Socket.current.message("PROJECT_UPDATED");
    expect(milestoneCalls()).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(milestoneCalls()).toEqual([
      [{ queryKey: ["feature-milestones", "p"] }],
    ]);
    expectReleaseMilestonesInvalidated();
    expect(columnCalls()).toEqual([[{ queryKey: ["columns", "p"] }]]);
  });
  it("does not reread workflow definitions for task-only event bursts", () => {
    renderHook(() => useProjectWebSocket("p"));
    for (const type of ["TASK_CREATED", "TASK_UPDATED", "MILESTONES_UPDATED"])
      Socket.current.message(type, { taskId: "a", featureId: "f" });
    vi.advanceTimersByTime(300);
    expect(columnCalls()).toEqual([]);
  });
  it("shares one workflow refresh across project and task message bursts", () => {
    renderHook(() => useProjectWebSocket("p"));
    for (const taskId of ["a", "b", "c"]) {
      Socket.current.message("TASK_UPDATED", { taskId });
      Socket.current.message("PROJECT_UPDATED");
    }
    expect(columnCalls()).toEqual([]);
    vi.advanceTimersByTime(300);
    expect(columnCalls()).toEqual([[{ queryKey: ["columns", "p"] }]]);
    expect(milestoneCache.getQueryState(["columns", "p"])?.isInvalidated).toBe(
      true,
    );
    expect(
      milestoneCache.getQueryState(["columns", "other"])?.isInvalidated,
    ).toBe(false);
  });
  it.each(["project update", "reconnect", "fallback"])(
    "refreshes active release Done and Started definitions after %s",
    async (source) => {
      const updatedWorkflow = [
        { id: "b", slug: "active", position: 0, isFinal: false },
        { id: "a", slug: "todo", position: 1, isFinal: false },
        { id: "c", slug: "done", position: 2, isFinal: false },
      ];
      const read = vi.fn(async () => updatedWorkflow);
      const workflow = new QueryObserver(milestoneCache, {
        queryKey: ["columns", "p"],
        queryFn: read,
        staleTime: Infinity,
      });
      const unsubscribe = workflow.subscribe(() => {});
      renderHook(() => useProjectWebSocket("p"));
      expect(read).not.toHaveBeenCalled();
      expect([...finalStatuses(workflow.getCurrentResult().data!)]).toEqual([
        "done",
      ]);
      expect([...startedStatuses(workflow.getCurrentResult().data!)]).toEqual([
        "active",
        "done",
      ]);

      if (source === "project update")
        Socket.current.message("PROJECT_UPDATED");
      else if (source === "reconnect") Socket.current.onopen?.();
      else {
        for (let retry = 0; retry < 5; retry++) {
          Socket.current.onclose?.();
          vi.advanceTimersByTime(1000 * 2 ** retry);
        }
        Socket.current.onclose?.();
        vi.advanceTimersByTime(30_000);
      }
      await vi.advanceTimersByTimeAsync(300);
      expect(read).toHaveBeenCalledOnce();
      expect([...finalStatuses(workflow.getCurrentResult().data!)]).toEqual([]);
      expect([...startedStatuses(workflow.getCurrentResult().data!)]).toEqual([
        "todo",
        "done",
      ]);
      expect(
        milestoneCache.getQueryState(["columns", "other"])?.isInvalidated,
      ).toBe(false);
      unsubscribe();
    },
  );
  it.each([
    "MILESTONES_UPDATED",
    "TASK_CREATED",
    "TASK_UPDATED",
    "TASK_DELETED",
    "TASK_MOVED",
    "TASK_RELATION_UPDATED",
    "PROJECT_UPDATED",
  ])("refreshes release milestone metadata after remote %s", (type) => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message(type, {
      featureId: "f",
      taskId: "a",
      windowId: "another-window",
    });
    vi.advanceTimersByTime(300);
    expect(milestoneCalls()).toHaveLength(1);
    expectReleaseMilestonesInvalidated();
    expectCandidatesInvalidated();
  });
  it("refreshes only details belonging to the changed Feature", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("MILESTONES_UPDATED", { featureId: "f" });
    vi.advanceTimersByTime(300);
    const filters = mocks.client.invalidateQueries.mock.calls.find(
      ([filter]) => filter.queryKey?.[0] === "task" && filter.predicate,
    )?.[0];
    expect(
      filters.predicate({
        state: { data: { id: "a", projectId: "p", featureId: "f" } },
      }),
    ).toBe(true);
    expect(
      filters.predicate({
        state: { data: { id: "b", projectId: "p", featureId: "elsewhere" } },
      }),
    ).toBe(false);
    expect(
      filters.predicate({
        state: { data: { id: "a", projectId: "other", featureId: "f" } },
      }),
    ).toBe(false);
  });
  it("reconciles milestones on reconnect and drops pending refresh on unmount", () => {
    const { unmount } = renderHook(() => useProjectWebSocket("p"));
    Socket.current.onopen?.();
    expect(milestoneCalls()).toHaveLength(1);
    expectReleaseMilestonesInvalidated();
    expectCandidatesInvalidated();
    Socket.current.message("MILESTONES_UPDATED");
    unmount();
    vi.advanceTimersByTime(300);
    expect(milestoneCalls()).toHaveLength(1);
    expect(candidateCalls()).toHaveLength(1);
  });
  it("polls milestones in disconnected fallback", () => {
    renderHook(() => useProjectWebSocket("p"));
    for (let retry = 0; retry < 5; retry++) {
      Socket.current.onclose?.();
      vi.advanceTimersByTime(1000 * 2 ** retry);
    }
    Socket.current.onclose?.();
    vi.advanceTimersByTime(30000);
    expect(milestoneCalls()).toEqual([
      [{ queryKey: ["feature-milestones", "p"] }],
    ]);
    expectReleaseMilestonesInvalidated();
    expectCandidatesInvalidated();
  });
  it("refreshes release metadata and chart without loading the board", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("RELEASES_UPDATED");
    vi.advanceTimersByTime(300);
    expect(mocks.client.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["release-link-candidates", "p"] }],
      [{ queryKey: ["feature-create-candidates", "p"] }],
      [{ queryKey: ["releases", "p"] }],
      [{ queryKey: ["release-progress", "p"] }],
    ]);
    expect(mocks.client.setQueryData).not.toHaveBeenCalled();
  });

  it.each([
    "TASK_UPDATED",
    "TASK_CREATED",
    "TASK_DELETED",
    "TASK_MOVED",
    "PROJECT_UPDATED",
  ])("refreshes derived milestone totals in the release list on %s", (type) => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message(type, { taskId: "a" });
    vi.advanceTimersByTime(300);
    expect(releasesMarkedStale()).toBe(0);
    expect(releasesRefreshes()).toBe(1);
    expect(progressCalls()).toHaveLength(1);
  });

  it("refreshes milestone totals after a reorder that changes statuses", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("TASKS_REORDERED", {
      tasks: [{ id: "a", position: 1, status: "todo" }],
    });
    vi.advanceTimersByTime(300);
    expect(releasesMarkedStale()).toBe(0);
    expect(releasesRefreshes()).toBe(1);
    expect(progressCalls()).toHaveLength(1);
  });

  it("does not refresh chart history for a position-only reorder", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("TASKS_REORDERED", {
      tasks: [{ id: "a", position: 1 }],
    });
    vi.advanceTimersByTime(300);
    expect(progressCalls()).toEqual([]);
    expect(releaseCalls()).toEqual([]);
  });

  it("refreshes milestone totals when legacy relation writes change membership", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.message("TASK_RELATION_UPDATED", { taskId: "a" });
    vi.advanceTimersByTime(300);
    expect(releasesRefreshes()).toBe(1);
    expect(progressCalls()).toEqual([]);
  });

  it.each(["TASK_LABEL_UPDATED", "COMMENT_UPDATED"])(
    "leaves it alone on %s",
    (type) => {
      renderHook(() => useProjectWebSocket("p"));
      Socket.current.message(type, { taskId: "a" });
      vi.advanceTimersByTime(300);
      expect(releaseCalls()).toEqual([]);
      expect(progressCalls()).toEqual([]);
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
    expect(progressCalls()).toHaveLength(1);
    Socket.current.message("TASK_UPDATED", { taskId: "g" });
    vi.advanceTimersByTime(300);
    expect(releasesRefreshes()).toBe(2);
    expect(progressCalls()).toHaveLength(2);
    Socket.current.message("RELEASES_UPDATED");
    vi.advanceTimersByTime(300);
    expect(releasesRefreshes()).toBe(3);
    expect(progressCalls()).toHaveLength(3);
  });

  it("catches up when the socket opens", () => {
    renderHook(() => useProjectWebSocket("p"));
    Socket.current.onopen?.();
    expect(releaseCalls()).toEqual([
      [{ queryKey: ["releases", "p"] }, { cancelRefetch: false }],
    ]);
    expect(progressCalls()).toEqual([
      [{ queryKey: ["release-progress", "p"] }, { cancelRefetch: false }],
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
    expect(progressCalls()).toHaveLength(1);
  });

  it("polls chart history after all reconnect attempts fail", () => {
    renderHook(() => useProjectWebSocket("p"));
    for (let retry = 0; retry < 5; retry++) {
      Socket.current.onclose?.();
      vi.advanceTimersByTime(1_000 * 2 ** retry);
    }
    Socket.current.onclose?.();
    vi.advanceTimersByTime(30_000);
    expect(progressCalls()).toEqual([
      [{ queryKey: ["release-progress", "p"] }],
    ]);
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
    expect(progressCalls()).toHaveLength(0);
  });
});
