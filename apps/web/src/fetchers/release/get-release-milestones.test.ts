import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import getReleaseMilestones from "./get-release-milestones";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@kaneo/libs", () => ({
  client: { release: { ":id": { milestones: { $get: mocks.get } } } },
}));

beforeEach(() => vi.clearAllMocks());

describe("getReleaseMilestones", () => {
  it("reads the release metadata once without per-Feature requests", async () => {
    const milestones = [
      { id: "m1", featureId: "f1", title: "Core", position: 0 },
      { id: "m2", featureId: "f2", title: "Launch", position: 1 },
    ];
    mocks.get.mockResolvedValue(Response.json(milestones));

    expect(await getReleaseMilestones("r", "Europe/Belgrade")).toEqual(
      milestones,
    );
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith({
      param: { id: "r" },
      query: { timeZone: "Europe/Belgrade" },
    });
  });

  it("returns an empty list when the release has no milestones", async () => {
    mocks.get.mockResolvedValue(Response.json([]));
    expect(await getReleaseMilestones("r")).toEqual([]);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith({
      param: { id: "r" },
      query: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
  });

  it("exposes failures for the release view's retry state", async () => {
    mocks.get.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(getReleaseMilestones("r")).rejects.toMatchObject({
      status: 503,
    });
  });
});
