import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import createTask from "@/fetchers/task/create-task";
import useCreateTask from "./use-create-task";
import { HttpError } from "@/lib/http-error";

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
  queryClient.setQueryData(["release-progress", "p", "r1", "UTC"], {});
  queryClient.setQueryData(["release-link-candidates", "p"], []);
  queryClient.setQueryData(["release-link-candidates", "other"], []);
  queryClient.setQueryData(["feature-create-candidates", "p", "", 1], []);
  queryClient.setQueryData(["feature-create-candidates", "other", "", 1], []);
});
afterEach(() => queryClient.clear());

it.each([
  ["in a release", "r1", undefined, true, true],
  ["in no release", null, undefined, false, false],
  ["in a milestone with an explicit empty release", null, "m", true, false],
])(
  "refreshes affected release and chart totals for a task created %s",
  async (_case, releaseId, milestoneId, refreshed, chartRefreshed) => {
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
        ...(milestoneId ? { milestoneId, featureId: "f" } : {}),
      } as never);
    });

    expect(queryClient.getQueryState(["releases", "p"])?.isInvalidated).toBe(
      refreshed,
    );
    expect(
      queryClient.getQueryState(["release-progress", "p", "r1", "UTC"])
        ?.isInvalidated,
    ).toBe(chartRefreshed);
    expect(
      queryClient.getQueryState(["release-link-candidates", "p"])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["release-link-candidates", "other"])
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["feature-create-candidates", "p", "", 1])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["feature-create-candidates", "other", "", 1])
        ?.isInvalidated,
    ).toBe(false);
  },
);

it("refreshes hierarchy, existing work and child releases when the Feature response has no release", async () => {
  const affected = [
    ["feature-library", "p"],
    ["project-features", "p"],
    ["tasks", "p"],
    ["feature-milestones", "p", "project", "UTC"],
    ["task", "feature"],
    ["activities", "feature"],
    ["task-relations", "feature"],
    ["task", "existing"],
    ["activities", "existing"],
    ["task-relations", "existing"],
  ];
  for (const key of affected) queryClient.setQueryData(key, {});
  queryClient.setQueryData(["task", "other"], { projectId: "other" });
  vi.mocked(createTask).mockResolvedValue({
    id: "feature",
    type: "feature",
    projectId: "p",
    releaseId: null,
  } as never);
  const { result } = renderHook(() => useCreateTask(), { wrapper });
  const featureComposition = {
    milestones: [{ key: "core", title: "Core", releaseId: "r1" }],
    existingTasks: [{ id: "existing", milestoneKey: "core" }],
    newTasks: [
      { title: "New bug", type: "bug" as const, milestoneKey: "core" },
    ],
    unassignedReleaseId: null,
  };
  await act(async () => {
    await result.current.mutateAsync({
      title: "Feature",
      description: "",
      projectId: "p",
      type: "feature",
      featureComposition,
    });
  });
  for (const key of [
    ...affected,
    ["releases", "p"],
    ["release-progress", "p", "r1", "UTC"],
  ])
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["task", "other"])?.isInvalidated).toBe(
    false,
  );
  expect(vi.mocked(createTask).mock.calls.at(-1)?.at(-1)).toMatchObject({
    type: "feature",
    featureComposition,
  });
});

it("refreshes eligible candidates after a stale existing-work conflict without announcing a saved hierarchy", async () => {
  vi.mocked(createTask).mockRejectedValueOnce(
    new HttpError(409, "Selected work changed"),
  );
  const { result } = renderHook(() => useCreateTask(), { wrapper });
  await act(async () => {
    await result.current
      .mutateAsync({
        title: "Feature",
        description: "",
        projectId: "p",
        type: "feature",
        featureComposition: { existingTasks: [{ id: "existing" }] },
      })
      .catch(() => undefined);
  });
  expect(
    queryClient.getQueryState(["feature-create-candidates", "p", "", 1])
      ?.isInvalidated,
  ).toBe(true);
  expect(queryClient.getQueryState(["releases", "p"])?.isInvalidated).toBe(
    false,
  );
  expect(
    queryClient.getQueryState(["release-progress", "p", "r1", "UTC"])
      ?.isInvalidated,
  ).toBe(false);
});
