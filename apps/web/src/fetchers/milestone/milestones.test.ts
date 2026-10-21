import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createMilestone,
  getMilestone,
  getMilestones,
  getProjectMilestones,
  reorderMilestones,
  updateMilestone,
} from "./milestones";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  reorder: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@kaneo/libs", () => ({
  client: {
    milestone: {
      project: { ":projectId": { $get: mocks.get } },
      ":id": { $get: mocks.read, $patch: mocks.update },
      feature: {
        ":featureId": {
          $get: mocks.list,
          $post: mocks.create,
          order: { $put: mocks.reorder },
        },
      },
    },
  },
}));
beforeEach(() => vi.resetAllMocks());
describe("project milestone summaries", () => {
  it("loads every page in one project query, without per-Feature reads", async () => {
    mocks.get
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "a", featureId: "f1" }],
          pagination: { totalPages: 2 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "b", featureId: "f2" }],
          pagination: { totalPages: 2 },
        }),
      );
    expect(await getProjectMilestones("p", "America/New_York")).toEqual([
      { id: "a", featureId: "f1" },
      { id: "b", featureId: "f2" },
    ]);
    expect(mocks.get.mock.calls).toEqual([
      [
        {
          param: { projectId: "p" },
          query: { page: "1", limit: "100", timeZone: "America/New_York" },
        },
      ],
      [
        {
          param: { projectId: "p" },
          query: { page: "2", limit: "100", timeZone: "America/New_York" },
        },
      ],
    ]);
  });
  it("rejects an incomplete summary read rather than exposing partial Gantt data", async () => {
    mocks.get
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "a" }], pagination: { totalPages: 2 } }),
      )
      .mockResolvedValueOnce(new Response("Offline", { status: 503 }));
    await expect(getProjectMilestones("p")).rejects.toMatchObject({
      status: 503,
    });
  });
  it("updates a single planning field without replacing task planning", async () => {
    mocks.update.mockResolvedValue(Response.json({ id: "m", leadId: "u" }));
    await updateMilestone("m", { leadId: "u" }, "Europe/Belgrade");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      param: { id: "m" },
      json: { leadId: "u" },
      query: { timeZone: "Europe/Belgrade" },
    });
  });
  it("uses the browser timezone on list, detail and write responses without writing dates", async () => {
    mocks.list.mockResolvedValue(Response.json([]));
    mocks.read.mockResolvedValue(Response.json({ id: "m" }));
    mocks.create.mockResolvedValue(Response.json({ id: "m" }));
    mocks.reorder.mockResolvedValue(Response.json([]));
    await getMilestones("f");
    await getMilestone("m");
    await createMilestone("f", { title: "Core", taskIds: ["t"] });
    await reorderMilestones("f", ["m"]);
    const query = {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
      param: { featureId: "f" },
      query,
    });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({
      param: { id: "m" },
      query,
    });
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
      param: { featureId: "f" },
      json: { title: "Core", taskIds: ["t"] },
      query,
    });
    expect(mocks.reorder).toHaveBeenCalledExactlyOnceWith({
      param: { featureId: "f" },
      json: { milestoneIds: ["m"] },
      query,
    });
  });
  it("submits mixed draft work with existing links in one creation request", async () => {
    mocks.create.mockResolvedValue(Response.json({ id: "m" }));
    const input = {
      title: "Launch",
      releaseId: "release",
      taskIds: ["existing"],
      newTasks: [
        { title: "Implement launch", type: "task" as const },
        { title: "Fix launch", type: "bug" as const },
      ],
    };
    await createMilestone("feature", input, "Europe/Belgrade");
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
      param: { featureId: "feature" },
      json: input,
      query: { timeZone: "Europe/Belgrade" },
    });
  });
});
