import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import updateColumn from "@/fetchers/column/update-column";
import bulkOperation from "@/fetchers/task/bulk-operation";
import deleteTask from "@/fetchers/task/delete-task";
import updateTaskStatus from "@/fetchers/task/update-task-status";
import { useUpdateColumn } from "@/hooks/mutations/column/use-update-column";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import type Task from "@/types/task";
import { useBulkOperations } from "./use-bulk-operations";
import { useUpdateTaskStatus } from "./use-update-task-status";

vi.mock("@/fetchers/column/update-column", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task/bulk-operation", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task/delete-task", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task/update-task-status", () => ({ default: vi.fn() }));

const progressKey = ["release-progress", "p", "r1", "UTC"];
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(["feature-milestones", "p", "f"], []);
  queryClient.setQueryData(progressKey, { scope: 1, started: 0, completed: 0 });
  queryClient.setQueryData(["release-progress", "other", "r2", "UTC"], {});
  vi.mocked(updateTaskStatus).mockResolvedValue({} as never);
  vi.mocked(updateColumn).mockResolvedValue({} as never);
  vi.mocked(bulkOperation).mockResolvedValue({} as never);
  vi.mocked(deleteTask).mockReset();
});
afterEach(() => queryClient.clear());

it("refetches a mounted chart after a same-window status change", async () => {
  const readProgress = vi
    .fn()
    .mockResolvedValue({ scope: 1, started: 1, completed: 1 });
  const { result } = renderHook(
    () => ({
      chart: useQuery({
        queryKey: progressKey,
        queryFn: readProgress,
        staleTime: Infinity,
      }),
      mutation: useUpdateTaskStatus(),
    }),
    { wrapper },
  );

  expect(readProgress).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.mutation.mutateAsync({
      id: "t",
      projectId: "p",
      status: "done",
    } as Task);
  });

  await waitFor(() =>
    expect(result.current.chart.data).toEqual({
      scope: 1,
      started: 1,
      completed: 1,
    }),
  );
  expect(readProgress).toHaveBeenCalledTimes(1);
  expect(
    queryClient.getQueryState(["feature-milestones", "p", "f"])?.isInvalidated,
  ).toBe(true);
  expect(
    queryClient.getQueryState(["release-progress", "other", "r2", "UTC"])
      ?.isInvalidated,
  ).toBe(false);
});

it("refreshes every release and timezone when feature membership or task type changes", () => {
  const secondKey = ["release-progress", "p", "r2", "Europe/Belgrade"];
  queryClient.setQueryData(secondKey, {});
  invalidateFeatureChange(queryClient, "p", ["t", "feature"]);
  expect(queryClient.getQueryState(progressKey)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(secondKey)?.isInvalidated).toBe(true);
  expect(
    queryClient.getQueryState(["release-progress", "other", "r2", "UTC"])
      ?.isInvalidated,
  ).toBe(false);
});

it.each([
  [
    "archive",
    (mutations: ReturnType<typeof useBulkOperations>) =>
      mutations.bulkArchive(["t"]),
  ],
  [
    "status",
    (mutations: ReturnType<typeof useBulkOperations>) =>
      mutations.bulkChangeStatus({ taskIds: ["t"], status: "done" }),
  ],
  [
    "backlog",
    (mutations: ReturnType<typeof useBulkOperations>) =>
      mutations.bulkMoveToBacklog(["t"]),
  ],
  [
    "board",
    (mutations: ReturnType<typeof useBulkOperations>) =>
      mutations.bulkMoveToBoard({ taskIds: ["t"], status: "todo" }),
  ],
] as const)(
  "refreshes progress after a bulk %s operation",
  async (_name, mutate) => {
    const { result } = renderHook(() => useBulkOperations(), { wrapper });
    await act(async () => {
      await mutate(result.current);
    });
    expect(queryClient.getQueryState(progressKey)?.isInvalidated).toBe(true);
  },
);

it("refreshes progress after a partially successful bulk deletion", async () => {
  vi.mocked(deleteTask)
    .mockResolvedValueOnce({} as never)
    .mockRejectedValueOnce(new Error("denied"));
  const { result } = renderHook(() => useBulkOperations(), { wrapper });
  await act(async () => {
    await expect(result.current.bulkDelete(["a", "b"])).rejects.toThrow(
      "denied",
    );
  });
  expect(queryClient.getQueryState(progressKey)?.isInvalidated).toBe(true);
});

it("leaves progress fresh after an assignee-only bulk update", async () => {
  const { result } = renderHook(() => useBulkOperations(), { wrapper });
  await act(async () => {
    await result.current.bulkAssign({ taskIds: ["t"], userId: "u" });
  });
  expect(queryClient.getQueryState(progressKey)?.isInvalidated).toBe(false);
});

it.each([
  [{ isFinal: true }, true],
  [{ isFinal: false }, true],
  [{ name: "Ready" }, false],
])(
  "refreshes progress only for workflow changes: %j",
  async (data, invalidated) => {
    const { result } = renderHook(() => useUpdateColumn(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "column", projectId: "p", data });
    });
    expect(queryClient.getQueryState(progressKey)?.isInvalidated).toBe(
      invalidated,
    );
  },
);
