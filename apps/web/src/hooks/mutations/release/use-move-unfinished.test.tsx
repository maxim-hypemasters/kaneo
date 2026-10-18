import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import moveUnfinished from "@/fetchers/release/move-unfinished";
import { useMoveUnfinished } from "./use-move-unfinished";

vi.mock("@/fetchers/release/move-unfinished", () => ({ default: vi.fn() }));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const invalidated = (queryKey: string[]) =>
  queryClient.getQueryState(queryKey)?.isInvalidated;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
});
afterEach(() => queryClient.clear());

it("refreshes the board, the release list and each moved item", async () => {
  for (const queryKey of [
    ["tasks", "p"],
    ["releases", "p"],
    ["project-features", "p"],
    ["task", "t1"],
    ["activities", "t1"],
    ["task", "done"],
  ])
    queryClient.setQueryData(queryKey, {});
  vi.mocked(moveUnfinished).mockResolvedValue({
    movedTaskIds: ["t1"],
  } as never);
  const { result } = renderHook(() => useMoveUnfinished(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      id: "2.4",
      projectId: "p",
      targetReleaseId: "2.5",
    });
  });

  expect(moveUnfinished).toHaveBeenCalledWith("2.4", "2.5");
  expect(invalidated(["tasks", "p"])).toBe(true);
  expect(invalidated(["releases", "p"])).toBe(true);
  expect(invalidated(["project-features", "p"])).toBe(true);
  expect(invalidated(["task", "t1"])).toBe(true);
  expect(invalidated(["activities", "t1"])).toBe(true);
  // A finished task stays in the release it shipped in.
  expect(invalidated(["task", "done"])).toBe(false);
});
