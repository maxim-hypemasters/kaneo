import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  updateMilestone,
  type MilestoneWithFeature,
} from "@/fetchers/milestone/milestones";
import { useMoveMasterplanningMilestone } from "./use-move-masterplanning-milestone";

vi.mock("@/fetchers/milestone/milestones", () => ({
  updateMilestone: vi.fn(),
}));

const key = ["feature-milestones", "p", "project", "UTC"];
const original: MilestoneWithFeature = {
  id: "m",
  title: "Milestone",
  featureId: "feature",
  featureTitle: "Feature",
  projectId: "p",
  releaseId: "source",
  leadId: null,
  priority: "no-priority",
  status: "to-do",
  columnId: "todo",
  startDate: "2026-10-01",
  endDate: "2026-10-02",
  progress: { total: 2, started: 0, completed: 0 },
  position: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient();
  client.setQueryData(key, [original]);
});
afterEach(() => {
  cleanup();
  client.clear();
});

it("overlays only membership while saving and prevents duplicate moves", async () => {
  const save = deferred<MilestoneWithFeature>();
  vi.mocked(updateMilestone).mockReturnValue(save.promise);
  const { result, rerender } = renderHook(
    ({ items }) => useMoveMasterplanningMilestone("p", items),
    { wrapper, initialProps: { items: [original] } },
  );
  let moved!: Promise<boolean>;
  act(() => {
    moved = result.current.move("m", "target");
  });
  expect(result.current.pendingIds.has("m")).toBe(true);
  expect(result.current.milestones[0].releaseId).toBe("target");
  expect(await result.current.move("m", "other")).toBe(false);
  const changed = {
    ...original,
    status: "done",
    endDate: "2026-10-20",
    progress: { total: 2, completed: 2, started: 2 },
  };
  client.setQueryData(key, [changed]);
  rerender({ items: [changed] });
  expect(result.current.milestones[0]).toEqual({
    ...changed,
    releaseId: "target",
  });
  await act(async () => {
    save.resolve({ ...original, releaseId: "target" });
    expect(await moved).toBe(true);
  });
  expect(updateMilestone).toHaveBeenCalledExactlyOnceWith("m", {
    releaseId: "target",
  });
  expect(client.getQueryData(key)).toEqual([
    { ...changed, releaseId: "target" },
  ]);
  expect(result.current.pendingIds.size).toBe(0);
});

it("clears release membership with null and skips same-release and missing moves", async () => {
  vi.mocked(updateMilestone).mockResolvedValue({
    ...original,
    releaseId: null,
  });
  const { result } = renderHook(
    () => useMoveMasterplanningMilestone("p", [original]),
    { wrapper },
  );
  expect(await result.current.move("m", "source")).toBe(true);
  expect(await result.current.move("deleted", null)).toBe(false);
  expect(updateMilestone).not.toHaveBeenCalled();
  await act(async () => {
    expect(await result.current.move("m", null)).toBe(true);
  });
  expect(updateMilestone).toHaveBeenCalledExactlyOnceWith("m", {
    releaseId: null,
  });
  expect(client.getQueryData(key)).toEqual([{ ...original, releaseId: null }]);
});

it("retains failure context for retry and never rolls back newer server fields", async () => {
  const save = deferred<MilestoneWithFeature>();
  vi.mocked(updateMilestone).mockReturnValueOnce(save.promise);
  const { result, rerender } = renderHook(
    ({ items }) => useMoveMasterplanningMilestone("p", items),
    { wrapper, initialProps: { items: [original] } },
  );
  let moved!: Promise<boolean>;
  act(() => {
    moved = result.current.move("m", "target");
  });
  const changed = { ...original, endDate: "2026-11-01", leadId: "new-lead" };
  client.setQueryData(key, [changed]);
  rerender({ items: [changed] });
  const error = new Error("Save failed");
  await act(async () => {
    save.reject(error);
    expect(await moved).toBe(false);
  });
  expect(result.current.milestones[0]).toEqual(changed);
  expect(result.current.failures.get("m")).toEqual({
    releaseId: "target",
    error,
  });
  vi.mocked(updateMilestone).mockResolvedValue({
    ...changed,
    releaseId: "target",
  });
  await act(async () => {
    expect(await result.current.retry("m")).toBe(true);
  });
  expect(result.current.failures.size).toBe(0);
  expect(updateMilestone).toHaveBeenCalledTimes(2);
});

it("does not recreate a milestone deleted during saving", async () => {
  const save = deferred<MilestoneWithFeature>();
  vi.mocked(updateMilestone).mockReturnValue(save.promise);
  const { result, rerender } = renderHook(
    ({ items }) => useMoveMasterplanningMilestone("p", items),
    { wrapper, initialProps: { items: [original] } },
  );
  let moved!: Promise<boolean>;
  act(() => {
    moved = result.current.move("m", "target");
  });
  client.setQueryData(key, []);
  rerender({ items: [] });
  expect(result.current.milestones).toEqual([]);
  await act(async () => {
    save.resolve({ ...original, releaseId: "target" });
    await moved;
  });
  expect(client.getQueryData(key)).toEqual([]);
  expect(await result.current.retry("m")).toBe(false);
});

it("allows independent milestone moves without reopening a pending one", async () => {
  const first = deferred<MilestoneWithFeature>();
  const second = deferred<MilestoneWithFeature>();
  vi.mocked(updateMilestone)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const other = { ...original, id: "other", releaseId: null };
  client.setQueryData(key, [original, other]);
  const { result } = renderHook(
    () => useMoveMasterplanningMilestone("p", [original, other]),
    { wrapper },
  );
  let moveFirst!: Promise<boolean>;
  let moveSecond!: Promise<boolean>;
  act(() => {
    moveFirst = result.current.move("m", "target");
    moveSecond = result.current.move("other", "target");
  });
  expect([...result.current.pendingIds]).toEqual(["m", "other"]);
  await act(async () => {
    second.resolve({ ...other, releaseId: "target" });
    await moveSecond;
  });
  expect([...result.current.pendingIds]).toEqual(["m"]);
  expect(await result.current.move("m", "different")).toBe(false);
  await act(async () => {
    first.resolve({ ...original, releaseId: "target" });
    await moveFirst;
  });
  expect(client.getQueryData(key)).toEqual([
    { ...original, releaseId: "target" },
    { ...other, releaseId: "target" },
  ]);
});

it("refreshes both releases, candidates, Feature history and cached follower details", async () => {
  const keys = [
    ["releases", "p"],
    ["release-progress", "p", "source", "UTC"],
    ["release-progress", "p", "target", "UTC"],
    ["tasks", "p"],
    ["release-link-candidates", "p"],
    ["project-features", "p"],
    ["task", "follower"],
    ["activities", "follower"],
    ["activities", "feature"],
  ];
  for (const queryKey of keys)
    client.setQueryData(
      queryKey,
      queryKey[0] === "task" ? { projectId: "p" } : [],
    );
  client.setQueryData(["task", "other-project"], { projectId: "private" });
  vi.mocked(updateMilestone).mockResolvedValue({
    ...original,
    releaseId: "target",
  });
  const { result } = renderHook(
    () => useMoveMasterplanningMilestone("p", [original]),
    { wrapper },
  );
  await act(async () => {
    await result.current.move("m", "target");
  });
  for (const queryKey of [...keys, key])
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["task", "other-project"])?.isInvalidated).toBe(
    false,
  );
});
