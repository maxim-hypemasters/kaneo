import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { clearHolidayCalendar } from "@/fetchers/time-off/clear-holiday-calendar";
import { setHolidayCalendar } from "@/fetchers/time-off/set-holiday-calendar";
import { useSetHolidayCalendar } from "./use-set-holiday-calendar";

vi.mock("@/fetchers/time-off/set-holiday-calendar", () => ({
  setHolidayCalendar: vi.fn(async () => ({ status: "applied" })),
}));
vi.mock("@/fetchers/time-off/clear-holiday-calendar", () => ({
  clearHolidayCalendar: vi.fn(async () => ({ status: "applied" })),
}));

let client: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["time-off", "w1", "holidays", 2026, "me", "en"], {});
  client.setQueryData(["time-off", "w2", "holidays", 2026, "me", "en"], {});
  client.setQueryData(["project-schedule", "p1"], {});
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});

const stale = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;

it("sets a calendar and refreshes time off and schedules", async () => {
  const { result } = renderHook(() => useSetHolidayCalendar("w1", "de"), {
    wrapper,
  });

  await act(() => result.current.mutateAsync({ country: "DE", region: "BY" }));

  expect(setHolidayCalendar).toHaveBeenCalledWith(
    "w1",
    { userId: undefined, country: "DE", region: "BY" },
    "de",
  );
  expect(clearHolidayCalendar).not.toHaveBeenCalled();
  expect(stale(["time-off", "w1", "holidays", 2026, "me", "en"])).toBe(true);
  expect(stale(["time-off", "w2", "holidays", 2026, "me", "en"])).toBe(false);
  expect(stale(["project-schedule", "p1"])).toBe(true);
});

it("leaves schedules alone when the change waits for approval", async () => {
  vi.mocked(setHolidayCalendar).mockResolvedValueOnce({
    status: "pending",
  } as Awaited<ReturnType<typeof setHolidayCalendar>>);
  const { result } = renderHook(() => useSetHolidayCalendar("w1"), {
    wrapper,
  });

  await act(() => result.current.mutateAsync({ country: "AT" }));

  expect(stale(["time-off", "w1", "holidays", 2026, "me", "en"])).toBe(true);
  expect(stale(["project-schedule", "p1"])).toBe(false);
});

it("picks No calendar through the clear route, in the same language", async () => {
  const { result } = renderHook(() => useSetHolidayCalendar("w1", "de"), {
    wrapper,
  });

  await act(() => result.current.mutateAsync({ userId: "ana", country: null }));

  expect(clearHolidayCalendar).toHaveBeenCalledWith("w1", "ana", "de");
  expect(setHolidayCalendar).not.toHaveBeenCalled();
  expect(stale(["project-schedule", "p1"])).toBe(true);
});
