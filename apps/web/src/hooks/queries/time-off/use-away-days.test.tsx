import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { getTimeOffCalendar } from "@/fetchers/time-off/get-time-off-calendar";
import { timeOffKey, timeOffYearKey } from "./time-off-keys";
import { useAwayDays } from "./use-away-days";

const permission = vi.hoisted(() => ({ canRead: true, checking: false }));

vi.mock("@/fetchers/time-off/get-time-off-calendar", () => ({
  getTimeOffCalendar: vi.fn(),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canReadTimeOff: () => permission.canRead,
    isCheckingPermissions: permission.checking,
  }),
}));
vi.mock("@/components/time-off/use-time-off-format-locale", () => ({
  useTimeOffFormatLocale: () => "de",
}));

const fetchCalendar = vi.mocked(getTimeOffCalendar);
let client: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ws = "workspace-1";
const acrossNewYear = [{ from: "2026-12-01", to: "2027-01-31" }];

beforeEach(() => {
  permission.canRead = true;
  permission.checking = false;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  fetchCalendar.mockImplementation(async (_ws, from, to) => ({
    workspaceId: ws,
    from,
    to,
    entries: [],
    holidays: [{ userId: "bo", date: `${from.slice(0, 4)}-12-25` }],
  }));
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});

describe("useAwayDays", () => {
  it.each([
    ["without permission", () => (permission.canRead = false), acrossNewYear],
    [
      "while permissions load",
      () => (permission.checking = true),
      acrossNewYear,
    ],
    ["without a window", () => {}, []],
  ])("fetches nothing %s", async (_name, arrange, window) => {
    arrange();
    const { result } = renderHook(() => useAwayDays(ws, window), { wrapper });
    await act(async () => {});
    expect(fetchCalendar).not.toHaveBeenCalled();
    expect(result.current.byUser.size).toBe(0);
    expect(result.current.isPending).toBe(false);
  });

  it("loads one whole year per query under the workspace's time-off key", async () => {
    const { result } = renderHook(() => useAwayDays(ws, acrossNewYear), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(fetchCalendar).toHaveBeenCalledTimes(2);
    expect(fetchCalendar).toHaveBeenCalledWith(
      ws,
      "2026-01-01",
      "2026-12-31",
      "de",
    );
    expect(fetchCalendar).toHaveBeenCalledWith(
      ws,
      "2027-01-01",
      "2027-12-31",
      "de",
    );
    const keys = client
      .getQueryCache()
      .findAll({ queryKey: timeOffKey(ws) })
      .map((query) => query.queryKey);
    expect(keys).toEqual([
      timeOffYearKey(ws, 2026, "de"),
      timeOffYearKey(ws, 2027, "de"),
    ]);
    // Both years merged.
    expect([...(result.current.byUser.get("bo")?.keys() ?? [])]).toEqual([
      "2026-12-25",
      "2027-12-25",
    ]);
  });

  it("loads only the years the windows touch, each once", async () => {
    const windows = [
      { from: "2026-06-08", to: "2026-07-14" },
      { from: "2099-05-25", to: "2099-07-14" },
      { from: "2026-06-24", to: "2026-07-15" },
    ];
    const { result } = renderHook(() => useAwayDays(ws, windows), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(fetchCalendar.mock.calls.map(([, from, to]) => [from, to])).toEqual([
      ["2026-01-01", "2026-12-31"],
      ["2099-01-01", "2099-12-31"],
    ]);
  });

  it("reports a failed year and retries only that one", async () => {
    fetchCalendar.mockImplementation(async (_ws, from, to) => {
      if (from.startsWith("2027")) throw new Error("down");
      return { workspaceId: ws, from, to, entries: [], holidays: [] };
    });
    const { result } = renderHook(() => useAwayDays(ws, acrossNewYear), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchCalendar).toHaveBeenCalledTimes(2);

    fetchCalendar.mockImplementation(async (_ws, from, to) => ({
      workspaceId: ws,
      from,
      to,
      entries: [],
      holidays: [],
    }));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(fetchCalendar).toHaveBeenCalledTimes(3);
    expect(fetchCalendar).toHaveBeenLastCalledWith(
      ws,
      "2027-01-01",
      "2027-12-31",
      "de",
    );
  });
});
