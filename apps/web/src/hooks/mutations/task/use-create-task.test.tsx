import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import createTask from "@/fetchers/task/create-task";
import useCreateTask from "./use-create-task";

vi.mock("@/fetchers/task/create-task", () => ({ default: vi.fn() }));
vi.mock("@/lib/analytics/activation", () => ({ trackFirstTask: vi.fn() }));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  queryClient.setQueryData(["releases", "p"], []);
});
afterEach(() => queryClient.clear());

it.each([
  ["in a release", "r1", true],
  ["in no release", null, false],
])(
  "refreshes the release list only for a task created %s",
  async (_case, releaseId, refreshed) => {
    vi.mocked(createTask).mockResolvedValue({
      id: "t1",
      projectId: "p",
      releaseId,
    } as never);
    const { result } = renderHook(() => useCreateTask(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        title: "Card form",
        description: "",
        projectId: "p",
        status: "to-do",
        priority: "no-priority",
      } as never);
    });

    expect(queryClient.getQueryState(["releases", "p"])?.isInvalidated).toBe(
      refreshed,
    );
  },
);
