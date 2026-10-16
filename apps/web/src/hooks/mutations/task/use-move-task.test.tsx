import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import moveTask from "@/fetchers/task/move-task";
import { useMoveTask } from "./use-move-task";

vi.mock("@/fetchers/task/move-task", () => ({ default: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  vi.mocked(moveTask).mockResolvedValue({
    task: { id: "a", projectId: "dest", featureId: null },
    sourceProjectId: "source",
    destinationProjectId: "dest",
  } as Awaited<ReturnType<typeof moveTask>>);
});
afterEach(() => queryClient.clear());

it("refreshes the feature the moved task left", async () => {
  queryClient.setQueryData(["task", "a"], { id: "a", featureId: "f" });
  queryClient.setQueryData(["task", "f"], { id: "f", featureId: null });
  queryClient.setQueryData(["tasks", "source"], { columns: [] });
  const { result } = renderHook(() => useMoveTask(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      taskId: "a",
      destinationProjectId: "dest",
    });
  });

  expect(queryClient.getQueryState(["task", "f"])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["tasks", "source"])?.isInvalidated).toBe(
    true,
  );
});

it("refreshes the source board for a task without a feature", async () => {
  queryClient.setQueryData(["task", "a"], { id: "a", featureId: null });
  queryClient.setQueryData(["tasks", "source"], { columns: [] });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useMoveTask(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      taskId: "a",
      destinationProjectId: "dest",
    });
  });

  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["tasks", "source"] });
  expect(invalidate).not.toHaveBeenCalledWith({
    queryKey: ["task-relations"],
  });
});
