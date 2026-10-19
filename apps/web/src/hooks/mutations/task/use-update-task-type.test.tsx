import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useUpdateTaskType } from "./use-update-task-type";

vi.mock("@/fetchers/task/update-task-type", () => ({
  default: vi.fn().mockResolvedValue({ type: "bug" }),
}));
afterEach(cleanup);

it("refreshes mounted My Work and marks search, board, feature and release caches stale after conversion", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const assigned = ["assigned-tasks", "w", { countOnly: false }];
  const related = [
    ["search", { q: "crash", workspaceId: "w" }],
    ["tasks", "p"],
    ["project-features", "p"],
    ["release-progress", "p", "r", "UTC"],
    ["task", "t"],
    ["activities", "t"],
  ];
  client.setQueryData(assigned, [{ id: "t", type: "task" }]);
  for (const key of related) client.setQueryData(key, {});
  const readAssigned = vi.fn().mockResolvedValue([{ id: "t", type: "bug" }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({
      assigned: useQuery({
        queryKey: assigned,
        queryFn: readAssigned,
        staleTime: Infinity,
      }),
      mutation: useUpdateTaskType(),
    }),
    { wrapper },
  );
  await act(async () => {
    await result.current.mutation.mutateAsync({
      task: { id: "t", projectId: "p", featureId: "f" },
      type: "bug",
    });
  });
  await waitFor(() =>
    expect(result.current.assigned.data).toEqual([{ id: "t", type: "bug" }]),
  );
  expect(readAssigned).toHaveBeenCalledOnce();
  for (const key of related)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  client.clear();
});
