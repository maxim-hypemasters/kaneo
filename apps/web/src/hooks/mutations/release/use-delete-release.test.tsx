import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import deleteRelease from "@/fetchers/release/delete-release";
import type { Release } from "@/types/release";
import { useDeleteRelease } from "./use-delete-release";

vi.mock("@/fetchers/release/delete-release", () => ({ default: vi.fn() }));

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

it("drops the release and refreshes everything its items showed it on", async () => {
  queryClient.setQueryData(["releases", "p"], [
    { id: "2.4" },
    { id: "2.5" },
  ] as Release[]);
  // Former members whose ids this window doesn't know: the API unlinks them
  // and their own messages skip the window that deleted it.
  for (const queryKey of [
    ["tasks", "p"],
    ["project-features", "p"],
    ["task", "t1"],
    ["task", "t2"],
    ["activities", "t1"],
  ])
    queryClient.setQueryData(queryKey, {});
  vi.mocked(deleteRelease).mockResolvedValue({ id: "2.4" } as never);
  const { result } = renderHook(() => useDeleteRelease(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({ id: "2.4", projectId: "p" });
  });

  expect(
    queryClient.getQueryData<Release[]>(["releases", "p"])?.map(({ id }) => id),
  ).toEqual(["2.5"]);
  expect(invalidated(["tasks", "p"])).toBe(true);
  expect(invalidated(["releases", "p"])).toBe(true);
  expect(invalidated(["project-features", "p"])).toBe(true);
  expect(invalidated(["task", "t1"])).toBe(true);
  expect(invalidated(["task", "t2"])).toBe(true);
  expect(invalidated(["activities", "t1"])).toBe(true);
});
