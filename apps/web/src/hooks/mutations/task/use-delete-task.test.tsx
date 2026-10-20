import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import deleteTask from "@/fetchers/task/delete-task";
import useProjectStore from "@/store/project";
import type Task from "@/types/task";
import { useDeleteTask } from "./use-delete-task";

vi.mock("@/fetchers/task/delete-task", () => ({
  default: vi.fn(),
}));

function makeTask(id: string): Task {
  return {
    id,
    title: id,
    number: 1,
    description: null,
    status: "to-do",
    priority: null,
    startDate: null,
    dueDate: null,
    position: 0,
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId: "project-1",
    type: "task",
    featureId: null,
  };
}

function makeProject() {
  return {
    id: "project-1",
    name: "Project",
    slug: "PROJ",
    icon: null,
    description: null,
    isPublic: false,
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    workspaceId: "workspace-1",
    columns: [
      {
        id: "todo",
        slug: "to-do",
        name: "To Do",
        icon: null,
        isFinal: false,
        tasks: [makeTask("delete-me"), makeTask("keep-me")],
      },
    ],
    plannedTasks: [makeTask("delete-me")],
    archivedTasks: [makeTask("delete-me")],
  };
}

let queryClient: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  vi.clearAllMocks();
  useProjectStore.getState().setProject(undefined);
});

afterEach(() => {
  queryClient.clear();
  useProjectStore.getState().setProject(undefined);
});

describe("useDeleteTask", () => {
  it("removes a deleted task from query and project-store state", async () => {
    const project = makeProject();
    const deletedTask = {
      ...makeTask("delete-me"),
      status: "to-do",
      priority: "no-priority",
      columnId: "todo",
      type: "task" as const,
      featureId: null,
      releaseId: null,
      milestoneId: null,
      archivedAt: null,
    };
    queryClient.setQueryData(["tasks", project.id], project);
    queryClient.setQueryData(["task", deletedTask.id], deletedTask);
    useProjectStore.getState().setProject(project);
    vi.mocked(deleteTask).mockResolvedValue(deletedTask);

    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(deletedTask.id);
    });

    const cachedProject = queryClient.getQueryData<
      ReturnType<typeof makeProject>
    >(["tasks", project.id]);
    expect(cachedProject?.columns[0]?.tasks.map(({ id }) => id)).toEqual([
      "keep-me",
    ]);
    expect(cachedProject?.plannedTasks).toEqual([]);
    expect(cachedProject?.archivedTasks).toEqual([]);
    expect(queryClient.getQueryData(["task", deletedTask.id])).toBeUndefined();
    expect(
      queryClient.getQueryState(["tasks", project.id])?.isInvalidated,
    ).toBe(true);

    const storedProject = useProjectStore.getState().project;
    expect(storedProject?.columns[0]?.tasks.map(({ id }) => id)).toEqual([
      "keep-me",
    ]);
    expect(storedProject?.plannedTasks).toEqual([]);
    expect(storedProject?.archivedTasks).toEqual([]);
  });

  it("leaves query and project-store state unchanged when deletion fails", async () => {
    const project = makeProject();
    const task = makeTask("delete-me");
    queryClient.setQueryData(["tasks", project.id], project);
    queryClient.setQueryData(["task", task.id], task);
    useProjectStore.getState().setProject(project);
    vi.mocked(deleteTask).mockRejectedValue(new Error("Delete failed"));

    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(task.id)).rejects.toThrow(
        "Delete failed",
      );
    });

    expect(queryClient.getQueryData(["tasks", project.id])).toEqual(project);
    expect(queryClient.getQueryData(["task", task.id])).toEqual(task);
    expect(useProjectStore.getState().project).toEqual(project);
  });

  it("refreshes the feature of a deleted task", async () => {
    const project = makeProject();
    const deletedTask = {
      ...makeTask("delete-me"),
      status: "to-do",
      priority: "no-priority",
      columnId: "todo",
      type: "task" as const,
      featureId: "feature-1",
      releaseId: null,
      milestoneId: null,
      archivedAt: null,
    };
    queryClient.setQueryData(["tasks", project.id], project);
    queryClient.setQueryData(["task", "feature-1"], makeTask("feature-1"));
    vi.mocked(deleteTask).mockResolvedValue(deletedTask);
    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(deletedTask.id);
    });

    expect(
      queryClient.getQueryState(["task", "feature-1"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["tasks", project.id])?.isInvalidated,
    ).toBe(true);
  });

  it("refreshes the tasks of a deleted feature", async () => {
    const project = makeProject();
    const member = { ...makeTask("keep-me"), featureId: "delete-me" };
    project.columns[0].tasks = [member];
    queryClient.setQueryData(["tasks", project.id], project);
    queryClient.setQueryData(["task", member.id], member);
    vi.mocked(deleteTask).mockResolvedValue({
      ...makeTask("delete-me"),
      status: null,
      priority: null,
      columnId: null,
      userId: null,
      startDate: null,
      dueDate: null,
      type: "feature",
      featureId: null,
      releaseId: null,
      milestoneId: null,
      archivedAt: null,
    });
    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("delete-me");
    });

    expect(queryClient.getQueryState(["task", member.id])?.isInvalidated).toBe(
      true,
    );
  });
});
