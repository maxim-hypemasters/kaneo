import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  reorderMilestones,
  setTaskMilestone,
} from "@/fetchers/milestone/milestones";
import { HttpError } from "@/lib/http-error";
import {
  useMilestoneMutations,
  useSetTaskMilestone,
} from "./use-milestone-mutations";
vi.mock("@/fetchers/milestone/milestones", () => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  reorderMilestones: vi.fn(),
  setTaskMilestone: vi.fn(),
}));
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const keys = [
  ["feature-milestones", "p", "f"],
  ["feature-milestones", "p", "f", "task-candidates"],
  ["tasks", "p"],
  ["task-relations", "f"],
  ["task", "t"],
  ["activities", "t"],
  ["task-relations", "t"],
];
const metadataKeys = [
  keys[0],
  keys[1],
  ["feature-milestones", "p", "other-feature"],
  ["feature-milestones", "p", "release", "r"],
  ["feature-milestones", "p", "release", "another-release"],
];
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  for (const key of [...keys, ...metadataKeys]) client.setQueryData(key, []);
  client.setQueryData(["feature-milestones", "other", "f2"], []);
  client.setQueryData(["feature-milestones", "other", "release", "r"], []);
  vi.clearAllMocks();
});
afterEach(() => client.clear());
function expectProjectMilestonesInvalidated() {
  for (const key of metadataKeys)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(
    client.getQueryState(["feature-milestones", "other", "f2"])?.isInvalidated,
  ).toBe(false);
  expect(
    client.getQueryState(["feature-milestones", "other", "release", "r"])
      ?.isInvalidated,
  ).toBe(false);
}
it("refreshes the new/old milestone counts and selected work after atomic creation", async () => {
  vi.mocked(createMilestone).mockResolvedValue({ id: "m" } as never);
  const { result } = renderHook(() => useMilestoneMutations("p", "f"), {
    wrapper,
  });
  await act(async () => {
    await result.current.create.mutateAsync({
      title: "Launch",
      taskIds: ["t"],
    });
  });
  for (const key of keys)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expectProjectMilestonesInvalidated();
});
it("refreshes candidates after a stale selection without invalidating task values", async () => {
  vi.mocked(createMilestone).mockRejectedValue(new HttpError(409, "changed"));
  const { result } = renderHook(() => useMilestoneMutations("p", "f"), {
    wrapper,
  });
  await act(async () => {
    await result.current.create
      .mutateAsync({ title: "Launch", taskIds: ["t"] })
      .catch(() => undefined);
  });
  expect(client.getQueryState(keys[1])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["task", "t"])?.isInvalidated).toBe(false);
  expectProjectMilestonesInvalidated();
});
it("refreshes release grouping after a local milestone rename", async () => {
  vi.mocked(updateMilestone).mockResolvedValue({ id: "m" } as never);
  const { result } = renderHook(() => useMilestoneMutations("p", "f"), {
    wrapper,
  });
  await act(async () => {
    await result.current.update.mutateAsync({ id: "m", title: "Renamed" });
  });
  expectProjectMilestonesInvalidated();
});
it("refreshes release grouping and linked work after deleting a milestone", async () => {
  vi.mocked(deleteMilestone).mockResolvedValue(undefined);
  client.setQueryData(["task", "t"], {
    id: "t",
    projectId: "p",
    featureId: "f",
  });
  const { result } = renderHook(() => useMilestoneMutations("p", "f"), {
    wrapper,
  });
  await act(async () => {
    await result.current.remove.mutateAsync("m");
  });
  expectProjectMilestonesInvalidated();
  for (const key of [
    ["tasks", "p"],
    ["task", "t"],
    ["activities", "t"],
    ["task-relations", "f"],
  ])
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});
it("refreshes release ordering after a local reorder", async () => {
  vi.mocked(reorderMilestones).mockResolvedValue([]);
  const { result } = renderHook(() => useMilestoneMutations("p", "f"), {
    wrapper,
  });
  await act(async () => {
    await result.current.reorder.mutateAsync(["m2", "m1"]);
  });
  expectProjectMilestonesInvalidated();
});
it("reconciles release ordering after a rejected stale reorder", async () => {
  vi.mocked(reorderMilestones).mockRejectedValue(new HttpError(409, "changed"));
  const { result } = renderHook(() => useMilestoneMutations("p", "f"), {
    wrapper,
  });
  await act(async () => {
    await result.current.reorder
      .mutateAsync(["m2", "m1"])
      .catch(() => undefined);
  });
  expectProjectMilestonesInvalidated();
});
it.each(["m", null])(
  "refreshes release grouping and task details after assigning %s",
  async (milestoneId) => {
    vi.mocked(setTaskMilestone).mockResolvedValue({ id: "t" });
    const { result } = renderHook(() => useSetTaskMilestone("p", "f"), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ id: "t", milestoneId });
    });
    expectProjectMilestonesInvalidated();
    for (const key of [
      ["tasks", "p"],
      ["task", "t"],
      ["activities", "t"],
      ["task-relations", "f"],
    ])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  },
);
