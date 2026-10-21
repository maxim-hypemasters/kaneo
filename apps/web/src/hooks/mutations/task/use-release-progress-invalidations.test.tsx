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
import updateTaskDueDate from "@/fetchers/task/update-task-due-date";
import updateTaskTitle from "@/fetchers/task/update-task-title";
import { useUpdateColumn } from "@/hooks/mutations/column/use-update-column";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import type Task from "@/types/task";
import { useBulkOperations } from "./use-bulk-operations";
import { useUpdateTaskStatus } from "./use-update-task-status";
import { useUpdateTaskDueDate } from "./use-update-task-due-date";
import { useUpdateTaskTitle } from "./use-update-task-title";

vi.mock("@/fetchers/column/update-column", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task/bulk-operation", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task/delete-task", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task/update-task-status", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task/update-task-due-date", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task/update-task-title", () => ({ default: vi.fn() }));

const progressKey = ["release-progress", "p", "r1", "UTC"];
const releasesKey = ["releases", "p"];
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
  queryClient.setQueryData(releasesKey, [{ id: "r1", completedMilestones: 0 }]);
  queryClient.setQueryData(["releases", "other"], []);
  queryClient.setQueryData(["release-link-candidates", "p"], []);
  queryClient.setQueryData(["release-link-candidates", "other"], []);
  vi.mocked(updateTaskStatus).mockResolvedValue({} as never);
  vi.mocked(updateTaskDueDate).mockResolvedValue({
    dueDate: "2026-11-06T12:00:00Z",
  } as never);
  vi.mocked(updateColumn).mockResolvedValue({} as never);
  vi.mocked(updateTaskTitle).mockResolvedValue({ title: "Renamed" } as never);
  vi.mocked(bulkOperation).mockResolvedValue({} as never);
  vi.mocked(deleteTask).mockReset();
});
afterEach(() => queryClient.clear());

it("refetches an open linking picker after a narrow Task or Feature title edit", async () => {
  const candidateKey = ["release-link-candidates", "p"];
  const read = vi.fn().mockResolvedValue([{ id: "t", title: "Renamed" }]);
  const { result } = renderHook(
    () => ({
      candidates: useQuery({
        queryKey: candidateKey,
        queryFn: read,
        staleTime: Infinity,
      }),
      mutation: useUpdateTaskTitle(),
    }),
    { wrapper },
  );
  expect(read).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.mutation.mutateAsync({
      id: "t",
      projectId: "p",
      title: "Renamed",
    } as Task);
  });
  await waitFor(() =>
    expect(result.current.candidates.data).toEqual([
      { id: "t", title: "Renamed" },
    ]),
  );
  expect(read).toHaveBeenCalledOnce();
  expect(
    queryClient.getQueryState(["release-link-candidates", "other"])
      ?.isInvalidated,
  ).toBe(false);
});

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
    queryClient.getQueryState(["release-link-candidates", "p"])?.isInvalidated,
  ).toBe(true);
  expect(
    queryClient.getQueryState(["release-link-candidates", "other"])
      ?.isInvalidated,
  ).toBe(false);
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

it("refetches mounted release totals when linked work changes a milestone's derived completion", async () => {
  const readReleases = vi
    .fn()
    .mockResolvedValue([{ id: "r1", completedMilestones: 1 }]);
  const { result } = renderHook(
    () => ({
      releases: useQuery({
        queryKey: releasesKey,
        queryFn: readReleases,
        staleTime: Infinity,
      }),
      mutation: useUpdateTaskStatus(),
    }),
    { wrapper },
  );
  expect(readReleases).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.mutation.mutateAsync({
      id: "t",
      projectId: "p",
      status: "shipped",
    } as Task);
  });
  await waitFor(() =>
    expect(result.current.releases.data).toEqual([
      { id: "r1", completedMilestones: 1 },
    ]),
  );
  expect(readReleases).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryState(["releases", "other"])?.isInvalidated).toBe(
    false,
  );
});

it("refreshes mounted milestone dates and all project timezone caches after a narrow due-date update", async () => {
  const detailKey = [
    "feature-milestones",
    "p",
    "detail",
    "m",
    "Europe/Belgrade",
  ];
  const passiveKeys = [
    ["feature-milestones", "p", "f", "UTC"],
    ["feature-milestones", "p", "project", "America/New_York"],
    ["feature-milestones", "p", "release", "r1", "Asia/Tokyo"],
    ["feature-milestones", "p", "f", "task-candidates"],
  ];
  for (const key of [...passiveKeys, detailKey])
    queryClient.setQueryData(key, { endDate: "2026-11-04" });
  const otherProjectKey = ["feature-milestones", "other", "project", "UTC"];
  queryClient.setQueryData(otherProjectKey, []);
  const readMilestone = vi.fn().mockResolvedValue({ endDate: "2026-11-06" });
  const { result } = renderHook(
    () => ({
      milestone: useQuery({
        queryKey: detailKey,
        queryFn: readMilestone,
        staleTime: Infinity,
      }),
      mutation: useUpdateTaskDueDate(),
    }),
    { wrapper },
  );
  expect(readMilestone).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.mutation.mutateAsync({
      id: "t",
      projectId: "p",
      dueDate: "2026-11-06T12:00:00Z",
    } as Task);
  });
  await waitFor(() =>
    expect(result.current.milestone.data).toEqual({ endDate: "2026-11-06" }),
  );
  expect(readMilestone).toHaveBeenCalledTimes(1);
  for (const key of passiveKeys)
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(otherProjectKey)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(progressKey)?.isInvalidated).toBe(false);
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
    expect(queryClient.getQueryState(releasesKey)?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(["release-link-candidates", "p"])
        ?.isInvalidated,
    ).toBe(true);
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
  expect(queryClient.getQueryState(releasesKey)?.isInvalidated).toBe(true);
  expect(
    queryClient.getQueryState(["release-link-candidates", "p"])?.isInvalidated,
  ).toBe(true);
});

it("leaves progress fresh after an assignee-only bulk update", async () => {
  const { result } = renderHook(() => useBulkOperations(), { wrapper });
  await act(async () => {
    await result.current.bulkAssign({ taskIds: ["t"], userId: "u" });
  });
  expect(queryClient.getQueryState(progressKey)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(releasesKey)?.isInvalidated).toBe(false);
  expect(
    queryClient.getQueryState(["release-link-candidates", "p"])?.isInvalidated,
  ).toBe(false);
});

it("refreshes derived schedules after bulk date edits without changing release completion", async () => {
  const { result } = renderHook(() => useBulkOperations(), { wrapper });
  await act(async () => {
    await result.current.bulkDueDate({
      taskIds: ["t"],
      dueDate: "2026-11-06T12:00:00Z",
    });
  });
  expect(
    queryClient.getQueryState(["feature-milestones", "p", "f"])?.isInvalidated,
  ).toBe(true);
  expect(queryClient.getQueryState(releasesKey)?.isInvalidated).toBe(false);
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
    expect(queryClient.getQueryState(releasesKey)?.isInvalidated).toBe(
      invalidated,
    );
  },
);
