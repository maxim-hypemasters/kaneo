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
        tasks: [
          task("a"),
          task("f", { type: "feature" }),
          task("b", { featureId: "f" }),
        ],
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
  ])
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  expect(
    queryClient.getQueryState(["release-progress", "other", "r3", "UTC"])
      ?.isInvalidated,
  ).toBe(false);
});

it("patches a feature and the tasks that followed it, without reloading the board", async () => {
  vi.mocked(updateTaskRelease).mockResolvedValue({
    ...task("f", { type: "feature", releaseId: "r1" }),
    movedTaskIds: ["b"],
  } as unknown as Result);
  queryClient.setQueryData(["task", "b"], task("b"));
  queryClient.setQueryData(["project-features", "p"], []);
  const { result } = renderHook(() => useUpdateTaskRelease(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      task: { id: "f", projectId: "p" },
      releaseId: "r1",
    });
  });

  expect(boardTask("f")?.releaseId).toBe("r1");
  expect(boardTask("b")?.releaseId).toBe("r1");
  expect(boardTask("a")?.releaseId).toBeNull();
  expect(queryClient.getQueryState(["tasks", "p"])?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(["task", "b"])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["releases", "p"])?.isInvalidated).toBe(
    true,
  );
  expect(
    queryClient.getQueryState(["project-features", "p"])?.isInvalidated,
  ).toBe(true);
});

it("patches a moved task once the board read in flight lands", async () => {
  vi.mocked(updateTaskRelease).mockResolvedValue({
    ...task("f", { type: "feature", releaseId: "r1" }),
    movedTaskIds: ["b"],
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
      task: { id: "f", projectId: "p" },
      releaseId: "r1",
    });
  });
  // The read started before the change; it lands without the new release.
  await act(async () => {
    finishRead(board());
    await read;
  });

  expect(boardTask("b")?.releaseId).toBe("r1");
});
