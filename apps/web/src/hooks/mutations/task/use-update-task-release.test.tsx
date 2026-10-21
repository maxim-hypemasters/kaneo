import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import updateTaskRelease from "@/fetchers/task/update-task-release";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import { useUpdateTaskRelease } from "./use-update-task-release";

vi.mock("@/fetchers/task/update-task-release", () => ({ default: vi.fn() }));

type Result = Awaited<ReturnType<typeof updateTaskRelease>>;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    projectId: "p",
    status: "todo",
    position: 0,
    type: "task",
    releaseId: null,
    ...values,
  }) as Task;

const board = () =>
  ({
    id: "p",
    columns: [
      {
        id: "todo",
        slug: "todo",
        tasks: [task("a"), task("b", { featureId: "f" })],
      },
    ],
    plannedTasks: [],
    archivedTasks: [],
  }) as unknown as ProjectWithTasks;

const boardTask = (id: string) =>
  queryClient
    .getQueryData<ProjectWithTasks>(["tasks", "p"])
    ?.columns[0].tasks.find((item) => item.id === id);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  queryClient.setQueryData(["tasks", "p"], board());
  queryClient.setQueryData(["releases", "p"], []);
  queryClient.setQueryData(["release-progress", "p", "r1", "UTC"], {});
  queryClient.setQueryData(
    ["release-progress", "p", "r2", "Europe/Belgrade"],
    {},
  );
  queryClient.setQueryData(["release-progress", "other", "r3", "UTC"], {});
  queryClient.setQueryData(
    ["release-link-candidates", "p", "r1", "task", "", 1],
    [],
  );
  queryClient.setQueryData(
    ["release-link-candidates", "p", "r2", "milestone", "", 2],
    [],
  );
  queryClient.setQueryData(["release-link-candidates", "other"], []);
});
afterEach(() => queryClient.clear());

it("patches a plain task on the board without refetching it", async () => {
  vi.mocked(updateTaskRelease).mockResolvedValue({
    ...task("a", { releaseId: "r1" }),
    movedTaskIds: [],
  } as unknown as Result);
  const { result } = renderHook(() => useUpdateTaskRelease(), { wrapper });

  let moved: string[] = [];
  await act(async () => {
    moved = (
      await result.current.mutateAsync({
        task: { id: "a", projectId: "p" },
        releaseId: "r1",
      })
    ).movedTaskIds;
  });

  expect(moved).toEqual([]);
  expect(boardTask("a")?.releaseId).toBe("r1");
  expect(queryClient.getQueryState(["tasks", "p"])?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(["releases", "p"])?.isInvalidated).toBe(
    true,
  );
  for (const key of [
    ["release-progress", "p", "r1", "UTC"],
    ["release-progress", "p", "r2", "Europe/Belgrade"],
    ["release-link-candidates", "p", "r1", "task", "", 1],
    ["release-link-candidates", "p", "r2", "milestone", "", 2],
  ])
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  expect(
    queryClient.getQueryState(["release-progress", "other", "r3", "UTC"])
      ?.isInvalidated,
  ).toBe(false);
  expect(
    queryClient.getQueryState(["release-link-candidates", "other"])
      ?.isInvalidated,
  ).toBe(false);
});

it("preserves other linked leaves when a task overrides its release", async () => {
  vi.mocked(updateTaskRelease).mockResolvedValue({
    ...task("a", { releaseId: "r1", featureId: "f" }),
    movedTaskIds: [],
  } as unknown as Result);
  const { result } = renderHook(() => useUpdateTaskRelease(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({
      task: { id: "a", projectId: "p" },
      releaseId: "r1",
    });
  });
  expect(boardTask("a")?.releaseId).toBe("r1");
  expect(boardTask("b")?.releaseId).toBeNull();
  expect(queryClient.getQueryState(["tasks", "p"])?.isInvalidated).toBe(false);
});
it("patches an explicit leaf release once the in-flight board lands", async () => {
  vi.mocked(updateTaskRelease).mockResolvedValue({
    ...task("a", { releaseId: "r1" }),
    movedTaskIds: [],
  } as unknown as Result);
  let finishRead = (_board: ProjectWithTasks) => {};
  const read = queryClient.fetchQuery({
    queryKey: ["tasks", "p"],
    queryFn: () =>
      new Promise<ProjectWithTasks>((resolve) => {
        finishRead = resolve;
      }),
  });
  const { result } = renderHook(() => useUpdateTaskRelease(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({
      task: { id: "a", projectId: "p" },
      releaseId: "r1",
    });
  });
  await act(async () => {
    finishRead(board());
    await read;
  });
  expect(boardTask("a")?.releaseId).toBe("r1");
  expect(boardTask("b")?.releaseId).toBeNull();
});
