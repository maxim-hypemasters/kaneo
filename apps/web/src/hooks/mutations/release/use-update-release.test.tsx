import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import updateRelease from "@/fetchers/release/update-release";
import type { Release } from "@/types/release";
import { useUpdateRelease } from "./use-update-release";

vi.mock("@/fetchers/release/update-release", () => ({ default: vi.fn() }));

const release = (id: string, startDate: string): Release => ({
  id,
  projectId: "p",
  name: id,
  description: null,
  startDate,
  codeFreezeDate: startDate,
  submissionDate: startDate,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  progress: {
    tasks: { total: 4, completed: 1 },
    features: { total: 0, completed: 0 },
    unfinished: 3,
  },
});

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
});
afterEach(() => queryClient.clear());

it("replaces the edited release, keeping its progress and the start order", async () => {
  const before = release("2.4", "2026-10-01");
  queryClient.setQueryData(
    ["releases", "p"],
    [before, release("2.5", "2026-11-01")],
  );
  const { progress: _progress, ...edited } = {
    ...release("2.4", "2026-12-01"),
    name: "2.4 hotfix",
  };
  vi.mocked(updateRelease).mockResolvedValue(edited as never);
  const { result } = renderHook(() => useUpdateRelease(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      id: "2.4",
      projectId: "p",
      data: { name: "2.4 hotfix", startDate: "2026-12-01" },
    });
  });

  const releases = queryClient.getQueryData<Release[]>(["releases", "p"]);
  expect(releases?.map(({ id }) => id)).toEqual(["2.5", "2.4"]);
  expect(releases?.[1]).toMatchObject({
    name: "2.4 hotfix",
    progress: before.progress,
  });
  expect(queryClient.getQueryState(["releases", "p"])?.isInvalidated).toBe(
    true,
  );
});
