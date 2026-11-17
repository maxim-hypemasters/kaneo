import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { getHolidayCalendarRequests } from "@/fetchers/time-off/get-holiday-calendar-requests";
import { getMemberHolidays } from "@/fetchers/time-off/get-member-holidays";
import { getPendingTimeOffRequests } from "@/fetchers/time-off/get-pending-time-off-requests";
import { getTimeOffAllowanceDefaults } from "@/fetchers/time-off/get-time-off-allowance-defaults";
import { getTimeOffBalance } from "@/fetchers/time-off/get-time-off-balance";
import { getTimeOffBalances } from "@/fetchers/time-off/get-time-off-balances";
import { getTimeOffCalendar } from "@/fetchers/time-off/get-time-off-calendar";
import { getTimeOffRequest } from "@/fetchers/time-off/get-time-off-request";
import { getTimeOffRequests } from "@/fetchers/time-off/get-time-off-requests";
import { getTimeOffSettings } from "@/fetchers/time-off/get-time-off-settings";
import { timeOffKey } from "./time-off-keys";
import { useAwayDays } from "./use-away-days";
import { useHolidayCalendarRequests } from "./use-holiday-calendar-requests";
import { useMemberHolidayYears } from "./use-member-holiday-years";
import { useMemberHolidays } from "./use-member-holidays";
import { usePendingTimeOffRequests } from "./use-pending-time-off-requests";
import { useTimeOffAllowanceDefaults } from "./use-time-off-allowance-defaults";
import { useTimeOffBalance } from "./use-time-off-balance";
import { useTimeOffBalanceYears } from "./use-time-off-balance-years";
import { useTimeOffBalances } from "./use-time-off-balances";
import { useTimeOffCalendar } from "./use-time-off-calendar";
import { useTimeOffRequest } from "./use-time-off-request";
import { useTimeOffRequests } from "./use-time-off-requests";
import { useTimeOffSettings } from "./use-time-off-settings";

vi.mock("@/fetchers/time-off/get-holiday-calendar-requests", () => ({
  getHolidayCalendarRequests: vi.fn(async () => ({ requests: [] })),
}));
vi.mock("@/fetchers/time-off/get-time-off-settings", () => ({
  getTimeOffSettings: vi.fn(async () => ({ holidayCalendarDeadline: null })),
}));
vi.mock("@/fetchers/time-off/get-member-holidays", () => ({
  getMemberHolidays: vi.fn(async () => ({ calendar: null, holidays: [] })),
}));
vi.mock("@/fetchers/time-off/get-pending-time-off-requests", () => ({
  getPendingTimeOffRequests: vi.fn(async () => ({ requests: [] })),
}));
vi.mock("@/fetchers/time-off/get-time-off-allowance-defaults", () => ({
  getTimeOffAllowanceDefaults: vi.fn(async () => ({ defaultAllowances: {} })),
}));
vi.mock("@/fetchers/time-off/get-time-off-balance", () => ({
  getTimeOffBalance: vi.fn(async () => ({ year: 2026 })),
}));
vi.mock("@/fetchers/time-off/get-time-off-balances", () => ({
  getTimeOffBalances: vi.fn(async () => ({ balances: [] })),
}));
vi.mock("@/fetchers/time-off/get-time-off-calendar", () => ({
  getTimeOffCalendar: vi.fn(async () => ({ entries: [], holidays: [] })),
}));
vi.mock("@/fetchers/time-off/get-time-off-request", () => ({
  getTimeOffRequest: vi.fn(async () => ({ request: null })),
}));
vi.mock("@/fetchers/time-off/get-time-off-requests", () => ({
  getTimeOffRequests: vi.fn(async () => ({ requests: [] })),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canReadTimeOff: () => true,
    isCheckingPermissions: false,
  }),
}));
vi.mock("@/components/time-off/use-time-off-format-locale", () => ({
  useTimeOffFormatLocale: () => "en",
}));

let client: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  // The app's defaults (query-client/index.ts), which skip refetching on mount.
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false },
    },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});

const ws = "workspace-1";
const awayWindows = [{ from: "2026-11-01", to: "2026-11-30" }];

// [name, hook, the fetcher it calls]
const queries: Array<[string, () => unknown, unknown]> = [
  [
    "calendar",
    () => useTimeOffCalendar(ws, "2026-11-01", "2026-11-30"),
    getTimeOffCalendar,
  ],
  ["requests", () => useTimeOffRequests(ws, 2026), getTimeOffRequests],
  ["request", () => useTimeOffRequest(ws, "off-1"), getTimeOffRequest],
  ["balance", () => useTimeOffBalance(ws, 2026), getTimeOffBalance],
  [
    "balance years",
    () => useTimeOffBalanceYears(ws, [2026]),
    getTimeOffBalance,
  ],
  ["balances", () => useTimeOffBalances(ws, 2026), getTimeOffBalances],
  ["pending", () => usePendingTimeOffRequests(ws), getPendingTimeOffRequests],
  [
    "allowance defaults",
    () => useTimeOffAllowanceDefaults(ws),
    getTimeOffAllowanceDefaults,
  ],
  [
    "holiday calendar requests",
    () => useHolidayCalendarRequests(ws, "en"),
    getHolidayCalendarRequests,
  ],
  ["settings", () => useTimeOffSettings(ws), getTimeOffSettings],
  ["holidays", () => useMemberHolidays(ws, 2026), getMemberHolidays],
  ["holiday years", () => useMemberHolidayYears(ws, [2026]), getMemberHolidays],
  ["away days", () => useAwayDays(ws, awayWindows), getTimeOffCalendar],
];

describe("time-off queries", () => {
  it.each(queries)(
    "refetch the %s after an invalidation while nothing showed them",
    async (_name, useHook, fetcher) => {
      const first = renderHook(useHook, { wrapper });
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      first.unmount();

      await client.invalidateQueries({ queryKey: timeOffKey(ws) });
      expect(fetcher).toHaveBeenCalledTimes(1);

      renderHook(useHook, { wrapper });
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    },
  );

  it("reuse fresh data on remount without fetching again", async () => {
    const first = renderHook(() => useTimeOffBalance(ws, 2026), { wrapper });
    await waitFor(() => expect(getTimeOffBalance).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = renderHook(() => useTimeOffBalance(ws, 2026), { wrapper });
    await waitFor(() => expect(second.result.current.data).toBeDefined());
    expect(getTimeOffBalance).toHaveBeenCalledTimes(1);
  });
});
