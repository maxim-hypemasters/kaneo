import { beforeEach, expect, it, vi } from "vite-plus/test";
import { updateMilestone } from "@/fetchers/milestone/milestones";
import updateTaskRelease from "@/fetchers/task/update-task-release";
import type { ReleaseLinkCandidate } from "./get-release-link-candidates";
import { linkReleaseItems } from "./link-release-items";

vi.mock("@/fetchers/milestone/milestones", () => ({
  updateMilestone: vi.fn(),
}));
vi.mock("@/fetchers/task/update-task-release", () => ({ default: vi.fn() }));
const items = (...ids: string[]) =>
  ids.map((id) => ({ id }) as ReleaseLinkCandidate);
beforeEach(() => vi.clearAllMocks());

it("updates only release membership for tasks/bugs and retains partial successes", async () => {
  vi.mocked(updateTaskRelease).mockImplementation(async (id) => {
    if (id === "b") throw new Error("Failed");
    return {} as never;
  });
  expect(
    await linkReleaseItems("r", "task", items("a", "b", "c", "a")),
  ).toEqual({ succeeded: ["a", "c"], failed: ["b"] });
  expect(updateTaskRelease).toHaveBeenCalledTimes(3);
  expect(updateTaskRelease).toHaveBeenCalledWith("a", "r");
  expect(updateMilestone).not.toHaveBeenCalled();
});

it("uses the milestone writer so follower/override rules remain server-owned", async () => {
  vi.mocked(updateMilestone).mockResolvedValue({} as never);
  expect(await linkReleaseItems("r", "milestone", items("m"))).toEqual({
    succeeded: ["m"],
    failed: [],
  });
  expect(updateMilestone).toHaveBeenCalledExactlyOnceWith("m", {
    releaseId: "r",
  });
  expect(updateTaskRelease).not.toHaveBeenCalled();
});

it("bounds concurrent writes at four", async () => {
  let active = 0;
  let peak = 0;
  vi.mocked(updateTaskRelease).mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return {} as never;
  });
  const result = await linkReleaseItems(
    "r",
    "task",
    items(...Array.from({ length: 11 }, (_, i) => String(i))),
  );
  expect(peak).toBe(4);
  expect(result.succeeded).toHaveLength(11);
  expect(result.failed).toEqual([]);
});
