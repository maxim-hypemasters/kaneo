import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import createRelease from "@/fetchers/release/create-release";
import { HttpError } from "@/lib/http-error";
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
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
});

it("refreshes linked work, milestone metadata, history and cached project details after atomic creation", async () => {
  const keys = [
    ["tasks", "p"],
    ["releases", "p"],
    ["release-progress", "p", "new", "UTC"],
    ["feature-milestones", "p", "project", "UTC"],
    ["project-features", "p"],
    ["feature-library", "p"],
    ["release-link-candidates", "p", "create", "milestone", "", 1],
    ["release-link-candidates", "p", "existing", "milestone", "", 1],
    ["task", "follower"],
    ["activities", "follower"],
    ["task", "feature"],
    ["activities", "feature"],
  ];
  for (const key of keys)
    queryClient.setQueryData(key, key[0] === "task" ? { projectId: "p" } : []);
  queryClient.setQueryData(["tasks", "other"], []);
  queryClient.setQueryData(["task", "private"], { projectId: "other" });
  queryClient.setQueryData(["activities", "private"], []);
  const { progress: _progress, ...created } = release("new", "2026-11-01");
  vi.mocked(createRelease).mockResolvedValue(created as never);
  const { result } = renderHook(() => useCreateRelease(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      projectId: "p",
      data: {
        name: "new",
        startDate: "2026-11-01",
        codeFreezeDate: "2026-11-01",
        submissionDate: "2026-11-01",
        milestoneIds: ["milestone"],
      },
    });
  });

  for (const key of keys)
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of [
    ["tasks", "other"],
    ["task", "private"],
    ["activities", "private"],
  ])
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
});

it("refreshes stale milestone candidates after a selection conflict without creating a release", async () => {
  queryClient.setQueryData(["releases", "p"], []);
  const candidatesKey = [
    "release-link-candidates",
    "p",
    "create",
    "milestone",
    "",
    1,
  ];
  queryClient.setQueryData(candidatesKey, []);
  queryClient.setQueryData(["release-link-candidates", "other"], []);
  vi.mocked(createRelease).mockRejectedValue(
    new HttpError(409, "Milestone selection changed", {
      code: "MILESTONE_SELECTION_CONFLICT",
    }),
  );
  const { result } = renderHook(() => useCreateRelease(), { wrapper });

  await act(async () => {
    await expect(
      result.current.mutateAsync({
        projectId: "p",
        data: {
          name: "new",
          startDate: "2026-11-01",
          codeFreezeDate: "2026-11-01",
          submissionDate: "2026-11-01",
          milestoneIds: ["milestone"],
        },
      }),
    ).rejects.toMatchObject({ code: "MILESTONE_SELECTION_CONFLICT" });
  });

  expect(queryClient.getQueryData(["releases", "p"])).toEqual([]);
  expect(queryClient.getQueryState(candidatesKey)?.isInvalidated).toBe(true);
  expect(
    queryClient.getQueryState(["release-link-candidates", "other"])
      ?.isInvalidated,
  ).toBe(false);
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
