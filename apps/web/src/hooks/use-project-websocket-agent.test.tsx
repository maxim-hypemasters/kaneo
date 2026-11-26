import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
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

class Socket {
  static current: Socket;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = vi.fn();
  constructor() {
    Socket.current = this;
  }
  message(body: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify({ projectId: "p", ...body }) });
  }
}

const invalidatedKeys = () =>
  mocks.client.invalidateQueries.mock.calls.map(
    ([filters]) => filters?.queryKey,
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  mocks.client.invalidateQueries.mockReset();
  // A board that is still loading queues board messages; agent state must
  // not wait behind it.
  mocks.client.getQueryState.mockReturnValue({ fetchStatus: "fetching" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("refreshes only that task's agent state", async () => {
  renderHook(() => useProjectWebSocket("p"));
  Socket.current.message({ type: "TASK_AGENT_UPDATED", taskId: "t1" });
  await vi.advanceTimersByTimeAsync(1000);

  expect(invalidatedKeys()).toEqual([["task-agent", "t1"]]);
});

it("refreshes every task's agent state when the project settings change", async () => {
  renderHook(() => useProjectWebSocket("p"));
  Socket.current.message({ type: "TASK_AGENT_UPDATED" });
  await vi.advanceTimersByTimeAsync(1000);

  expect(invalidatedKeys()).toEqual([["task-agent"]]);
});
