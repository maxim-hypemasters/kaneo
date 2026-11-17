import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { approveHolidayCalendarRequest } from "@/fetchers/time-off/approve-holiday-calendar-request";
import { declineHolidayCalendarRequest } from "@/fetchers/time-off/decline-holiday-calendar-request";
import { useDecideHolidayCalendarRequest } from "./use-decide-holiday-calendar-request";

vi.mock("@/fetchers/time-off/approve-holiday-calendar-request", () => ({
  approveHolidayCalendarRequest: vi.fn(async () => ({})),
}));
vi.mock("@/fetchers/time-off/decline-holiday-calendar-request", () => ({
  declineHolidayCalendarRequest: vi.fn(async () => ({})),
}));

let client: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    ["time-off", "w1", "holiday-calendar-requests", "de"],
    {},
  );
  client.setQueryData(["project-schedule", "p1"], {});
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});

const stale = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;

it("approves the reviewed version and refreshes time off and schedules", async () => {
  const { result } = renderHook(
    () => useDecideHolidayCalendarRequest("w1", "de"),
    { wrapper },
  );

  await act(() =>
    result.current.mutateAsync({ id: "r1", version: 3, decision: "approve" }),
  );

  expect(approveHolidayCalendarRequest).toHaveBeenCalledWith(
    "w1",
    "r1",
    3,
    "de",
  );
  expect(declineHolidayCalendarRequest).not.toHaveBeenCalled();
  expect(stale(["time-off", "w1", "holiday-calendar-requests", "de"])).toBe(
    true,
  );
  expect(stale(["project-schedule", "p1"])).toBe(true);
});

it("declines without touching schedules", async () => {
  const { result } = renderHook(() => useDecideHolidayCalendarRequest("w1"), {
    wrapper,
  });

  await act(() =>
    result.current.mutateAsync({ id: "r1", version: 0, decision: "decline" }),
  );

  expect(declineHolidayCalendarRequest).toHaveBeenCalledWith(
    "w1",
    "r1",
    0,
    undefined,
  );
  expect(stale(["time-off", "w1", "holiday-calendar-requests", "de"])).toBe(
    true,
  );
  expect(stale(["project-schedule", "p1"])).toBe(false);
});
