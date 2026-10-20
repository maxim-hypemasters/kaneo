import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getProjectMilestones, updateMilestone } from "./milestones";
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@kaneo/libs", () => ({
  client: {
    milestone: {
      project: { ":projectId": { $get: mocks.get } },
      ":id": { $patch: mocks.update },
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
    expect(await getProjectMilestones("p")).toEqual([
      { id: "a", featureId: "f1" },
      { id: "b", featureId: "f2" },
    ]);
    expect(mocks.get.mock.calls).toEqual([
      [{ param: { projectId: "p" }, query: { page: "1", limit: "100" } }],
      [{ param: { projectId: "p" }, query: { page: "2", limit: "100" } }],
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
    await updateMilestone("m", { leadId: "u" });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      param: { id: "m" },
      json: { leadId: "u" },
    });
  });
});
