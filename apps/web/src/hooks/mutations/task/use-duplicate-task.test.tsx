import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import duplicateTask from "@/fetchers/task/duplicate-task";
import { useDuplicateTask } from "./use-duplicate-task";

vi.mock("@/fetchers/task/duplicate-task", () => ({ default: vi.fn() }));
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
type Copy = Awaited<ReturnType<typeof duplicateTask>>;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  queryClient.setQueryData(["tasks", "p"], { columns: [] });
  queryClient.setQueryData(["task", "f"], { id: "f" });
});
afterEach(() => queryClient.clear());

it("refreshes the feature a copy joins", async () => {
  vi.mocked(duplicateTask).mockResolvedValue({
    id: "copy",
    projectId: "p",
    type: "task",
    featureId: "f",
  } as Copy);
  const { result } = renderHook(() => useDuplicateTask(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({ taskId: "a" });
  });

  expect(queryClient.getQueryState(["task", "f"])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["tasks", "p"])?.isInvalidated).toBe(true);
});

it("refreshes only the board for a copy without a feature", async () => {
  vi.mocked(duplicateTask).mockResolvedValue({
    id: "copy",
    projectId: "p",
    type: "task",
    featureId: null,
  } as Copy);
  const { result } = renderHook(() => useDuplicateTask(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({ taskId: "a" });
  });

  expect(queryClient.getQueryState(["tasks", "p"])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["task", "f"])?.isInvalidated).toBe(false);
});
