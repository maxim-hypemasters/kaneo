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
import { useAssigneeBlockedDays } from "./use-assignee-blocked-days";

const permission = vi.hoisted(() => ({ canRead: true }));

vi.mock("@/fetchers/time-off/get-time-off-calendar", () => ({
  getTimeOffCalendar: vi.fn(),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    workspace: { id: "ws" },
    canReadTimeOff: () => permission.canRead,
    isCheckingPermissions: false,
  }),
}));
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

const fetchCalendar = vi.mocked(getTimeOffCalendar);
let client: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ann = { userId: "ann", name: "Ann" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15));
  permission.canRead = true;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  fetchCalendar.mockImplementation(async (_ws, from, to) => ({
    workspaceId: "ws",
    from,
    to,
    entries: [
      {
        id: "e1",
        userId: "ann",
        startDate: "2026-06-18",
        endDate: "2026-06-19",
      },
    ],
    holidays: [],
  }));
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useAssigneeBlockedDays", () => {
  it("blocks nothing for unassigned work or a viewer who can't read time off", async () => {
    const unassigned = renderHook(
      () => useAssigneeBlockedDays({ userId: null, name: null }, null),
      { wrapper },
    );
    expect(unassigned.result.current).toBeUndefined();

    permission.canRead = false;
    const hidden = renderHook(() => useAssigneeBlockedDays(ann, null), {
      wrapper,
    });
    expect(hidden.result.current).toBeUndefined();
    await act(async () => {});
    expect(fetchCalendar).not.toHaveBeenCalled();
  });

  it("blocks the assignee's days away once they load, and explains them", async () => {
    const { result } = renderHook(() => useAssigneeBlockedDays(ann, null), {
      wrapper,
    });
    // Nothing is blocked while the days load.
    expect(result.current?.isBlocked(new Date(2026, 5, 18))).toBe(false);

    await waitFor(() =>
      expect(result.current?.isBlocked(new Date(2026, 5, 18))).toBe(true),
    );
    expect(result.current?.isBlocked(new Date(2026, 5, 20))).toBe(false);
    expect(fetchCalendar).toHaveBeenCalledWith(
      "ws",
      "2026-01-01",
      "2026-12-31",
      "en",
    );
    expect(result.current?.describe(new Date(2026, 5, 18))).toMatch(
      /^tasks:datePicker\.assigneeAway .*"name":"Ann"/,
    );
    expect(result.current?.hint).toBe(
      `tasks:datePicker.awayHint ${JSON.stringify({ name: "Ann" })}`,
    );
  });

  it("loads only the shown month's year and today's, not the years between", async () => {
    const { result } = renderHook(
      () => useAssigneeBlockedDays(ann, new Date(2099, 5, 1)),
      { wrapper },
    );
    await waitFor(() => expect(result.current?.hint).toBeDefined());

    expect(fetchCalendar.mock.calls.map(([, from, to]) => [from, to])).toEqual([
      ["2026-01-01", "2026-12-31"],
      ["2099-01-01", "2099-12-31"],
    ]);
  });

  it("hints only at days away near the shown month or today", async () => {
    fetchCalendar.mockImplementation(async (_ws, from, to) => ({
      workspaceId: "ws",
      from,
      to,
      entries: [
        {
          id: "e2",
          userId: "ann",
          startDate: "2026-09-10",
          endDate: "2026-09-10",
        },
      ],
      holidays: [],
    }));
    const { result } = renderHook(() => useAssigneeBlockedDays(ann, null), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current?.isBlocked(new Date(2026, 8, 10))).toBe(true),
    );
    expect(result.current?.hint).toBeUndefined();

    act(() => result.current?.onMonthChange?.(new Date(2026, 8, 1)));
    expect(result.current?.hint).toBe(
      `tasks:datePicker.awayHint ${JSON.stringify({ name: "Ann" })}`,
    );
    expect(fetchCalendar).toHaveBeenCalledTimes(1);
  });

  it("loads the next year when the month grid moves into it", async () => {
    const { result } = renderHook(() => useAssigneeBlockedDays(ann, null), {
      wrapper,
    });
    await waitFor(() => expect(fetchCalendar).toHaveBeenCalledTimes(1));

    act(() => result.current?.onMonthChange?.(new Date(2027, 0, 1)));
    await waitFor(() =>
      expect(fetchCalendar).toHaveBeenCalledWith(
        "ws",
        "2027-01-01",
        "2027-12-31",
        "en",
      ),
    );
    expect(fetchCalendar).toHaveBeenCalledTimes(2);
  });
});
