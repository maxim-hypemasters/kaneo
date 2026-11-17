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
import { getTimeOffCalendar } from "@/fetchers/time-off/get-time-off-calendar";
import { useAwayLabels } from "./use-away-labels";

vi.mock("@/fetchers/time-off/get-time-off-calendar", () => ({
  getTimeOffCalendar: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      `${key}|${options?.date}`,
  }),
}));

vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-11-18",
}));

const permission = { canRead: true, checking: false };

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canReadTimeOff: () => permission.canRead,
    isCheckingPermissions: permission.checking,
  }),
}));

let client: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  // The app's defaults (query-client/index.ts), which skip refetching on mount.
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  permission.canRead = true;
  permission.checking = false;
  vi.mocked(getTimeOffCalendar).mockResolvedValue({
    workspaceId: "workspace-1",
    from: "2026-11-18",
    to: "2027-01-17",
    entries: [
      // Friday, then the Monday after: one stretch.
      {
        id: "a",
        userId: "ana",
        startDate: "2026-11-16",
        endDate: "2026-11-20",
      },
      {
        id: "b",
        userId: "ana",
        startDate: "2026-11-23",
        endDate: "2026-11-24",
      },
      {
        id: "c",
        userId: "ben",
        startDate: "2026-11-25",
        endDate: "2026-11-27",
      },
    ],
  } as Awaited<ReturnType<typeof getTimeOffCalendar>>);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});

describe("useAwayLabels", () => {
  it("loads nothing until a picker opens", () => {
    const { result } = renderHook(
      () => useAwayLabels("workspace-1", { enabled: false }),
      { wrapper },
    );

    expect(getTimeOffCalendar).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("labels members away today with the end of their stretch", async () => {
    const { result } = renderHook(
      () => useAwayLabels("workspace-1", { enabled: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(getTimeOffCalendar).toHaveBeenCalledWith(
      "workspace-1",
      "2026-11-18",
      "2027-01-17",
    );
    expect(result.current.get("ana")).toBe("team:timeOff.away.until|Nov 24");
    expect(result.current.has("ben")).toBe(false);
  });

  it("reloads on the next open after time off changed while closed", async () => {
    const first = renderHook(
      () => useAwayLabels("workspace-1", { enabled: true }),
      { wrapper },
    );
    await waitFor(() => expect(first.result.current.size).toBe(1));
    first.unmount();

    await client.invalidateQueries({ queryKey: ["time-off", "workspace-1"] });
    renderHook(() => useAwayLabels("workspace-1", { enabled: true }), {
      wrapper,
    });

    await waitFor(() => expect(getTimeOffCalendar).toHaveBeenCalledTimes(2));
  });

  it("loads nothing without permission to read time off", () => {
    permission.canRead = false;
    const { result } = renderHook(
      () => useAwayLabels("workspace-1", { enabled: true }),
      { wrapper },
    );

    expect(getTimeOffCalendar).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("waits for the permission check", () => {
    permission.checking = true;
    renderHook(() => useAwayLabels("workspace-1", { enabled: true }), {
      wrapper,
    });

    expect(getTimeOffCalendar).not.toHaveBeenCalled();
  });
});
