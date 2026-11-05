import { act, cleanup, renderHook } from "@testing-library/react";
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
import { useProjectWebSocket } from "./use-project-websocket";

vi.mock("@kaneo/libs", () => ({ windowId: "current-window" }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "member" } } }) },
}));

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event?: { code?: number; reason?: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = vi.fn();
  send = vi.fn();
  constructor() {
    Socket.instances.push(this);
  }
  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }
  message(schedulePublished = false) {
    this.onmessage?.({
      data: JSON.stringify({
        type: "SCHEDULE_UPDATED",
        projectId: "project",
        windowId: "current-window",
        schedulePublished,
      }),
    });
  }
}

let client: QueryClient;
const planKey = ["project-schedule", "project"];
const settingsKey = ["project-schedule", "project", "settings"];
const calendarKey = ["work-calendars", "workspace"];
const otherPlanKey = ["project-schedule", "other"];
const otherSettingsKey = ["project-schedule", "other", "settings"];
const boardKey = ["tasks", "project"];
const milestoneKey = ["feature-milestones", "project", "project", "UTC"];
const detailKey = ["task", "linked-work"];
const otherDetailKey = ["task", "foreign-work"];
const myWorkKey = ["assigned-tasks", "workspace", { countOnly: false }];
const activityKey = ["workspace-activity", "workspace"];
const stale = (key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated;
function subscribe() {
  return renderHook(() => useProjectWebSocket("project"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  Socket.instances = [];
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  for (const key of [
    planKey,
    settingsKey,
    calendarKey,
    otherPlanKey,
    otherSettingsKey,
    milestoneKey,
    myWorkKey,
    activityKey,
  ])
    client.setQueryData(key, {});
  client.setQueryData(boardKey, {
    id: "project",
    columns: [],
    plannedTasks: [],
    archivedTasks: [],
  });
  client.setQueryData(detailKey, { id: "linked-work", projectId: "project" });
  client.setQueryData(otherDetailKey, {
    id: "foreign-work",
    projectId: "other",
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("planning WebSocket reconciliation", () => {
  it("refreshes the plan, unit settings, and availability for input changes including this window", () => {
    subscribe();
    act(() => Socket.instances[0].message());
    for (const key of [planKey, settingsKey, calendarKey])
      expect(stale(key)).toBe(true);
    for (const key of [
      otherPlanKey,
      otherSettingsKey,
      boardKey,
      milestoneKey,
      detailKey,
      otherDetailKey,
    ])
      expect(stale(key)).toBe(false);
  });

  it("refreshes published placement, milestone bounds and cached task details without crossing projects", async () => {
    subscribe();
    act(() => Socket.instances[0].message(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    for (const key of [
      planKey,
      settingsKey,
      boardKey,
      milestoneKey,
      detailKey,
      myWorkKey,
      activityKey,
    ])
      expect(stale(key)).toBe(true);
    for (const key of [otherPlanKey, otherSettingsKey, otherDetailKey])
      expect(stale(key)).toBe(false);
  });

  it("reconciles schedule inputs and open details on reconnect", async () => {
    subscribe();
    act(() => Socket.instances[0].open());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    for (const key of [planKey, settingsKey, calendarKey, detailKey])
      client.setQueryData(key, {});
    client.setQueryData(detailKey, { id: "linked-work", projectId: "project" });
    act(() => Socket.instances[0].onclose?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      Socket.instances[1].open();
      await vi.advanceTimersByTimeAsync(0);
    });
    for (const key of [planKey, settingsKey, calendarKey, detailKey])
      expect(stale(key)).toBe(true);
    expect(stale(otherPlanKey)).toBe(false);
    expect(stale(otherDetailKey)).toBe(false);
  });

  it("polls project plan queries only after retries are exhausted and stops on unmount", async () => {
    const { unmount } = subscribe();
    for (let retry = 0; retry < 5; retry++) {
      act(() => Socket.instances.at(-1)?.onclose?.());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000 * 2 ** retry);
      });
    }
    act(() => Socket.instances.at(-1)?.onclose?.());
    expect(stale(planKey)).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    for (const key of [
      planKey,
      settingsKey,
      calendarKey,
      boardKey,
      milestoneKey,
      detailKey,
    ])
      expect(stale(key)).toBe(true);
    expect(stale(otherPlanKey)).toBe(false);
    expect(stale(otherDetailKey)).toBe(false);
    const calls = vi.spyOn(client, "invalidateQueries");
    unmount();
    calls.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
