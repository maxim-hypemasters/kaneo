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
  message(type: string) {
    this.onmessage?.({ data: JSON.stringify({ type, projectId: "p" }) });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  mocks.client.invalidateQueries.mockReset();
  // A board that is still loading queues board messages; links must not wait
  // behind it.
  mocks.client.getQueryState.mockReturnValue({ fetchStatus: "fetching" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("refreshes only the project's links on PROJECT_LINKS_UPDATED", async () => {
  renderHook(() => useProjectWebSocket("p"));
  Socket.current.message("PROJECT_LINKS_UPDATED");
  await vi.advanceTimersByTimeAsync(1000);

  expect(
    mocks.client.invalidateQueries.mock.calls.map(
      ([filters]) => filters?.queryKey,
    ),
  ).toEqual([["project-links", "p"]]);
});
