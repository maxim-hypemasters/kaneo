import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import createRelease from "@/fetchers/release/create-release";
import { EMPTY_RELEASE_PROGRESS } from "@/lib/releases/upsert-release";
import type { Release } from "@/types/release";
import { useCreateRelease } from "./use-create-release";

vi.mock("@/fetchers/release/create-release", () => ({ default: vi.fn() }));

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

it("lists the new release at once, in start order, and reads the list again", async () => {
  queryClient.setQueryData(
    ["releases", "p"],
    [release("2.4", "2026-10-01"), release("2.6", "2026-12-01")],
  );
  const { progress: _progress, ...created } = release("2.5", "2026-11-01");
  vi.mocked(createRelease).mockResolvedValue(created as never);
  const { result } = renderHook(() => useCreateRelease(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      projectId: "p",
      data: {
        name: "2.5",
        startDate: "2026-11-01",
        codeFreezeDate: "2026-11-01",
        submissionDate: "2026-11-01",
      },
    });
  });

  const releases = queryClient.getQueryData<Release[]>(["releases", "p"]);
  expect(releases?.map(({ id }) => id)).toEqual(["2.4", "2.5", "2.6"]);
  expect(releases?.[1].progress).toEqual(EMPTY_RELEASE_PROGRESS);
  expect(queryClient.getQueryState(["releases", "p"])?.isInvalidated).toBe(
    true,
  );
});
