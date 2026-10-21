import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getMilestoneCandidates } from "./get-milestone-candidates";
const mocks = vi.hoisted(() => ({ relations: vi.fn(), project: vi.fn() }));
vi.mock("@kaneo/libs", () => ({
  client: {
    "task-relation": { ":taskId": { $get: mocks.relations } },
    project: { ":id": { $get: mocks.project } },
  },
}));
const task = (
  id: string,
  number: number,
  type = "task",
  status = "todo",
  projectId = "p",
  milestoneId: string | null = null,
) => ({ id, title: id, number, type, status, projectId, milestoneId });
const link = (
  targetTask: ReturnType<typeof task> & {
    startDate?: string | null;
    dueDate?: string | null;
  },
  featureId = "f",
) => ({
  id: `feature:${targetTask.id}:${featureId}`,
  relationType: "subtask",
  sourceTaskId: featureId,
  targetTaskId: targetTask.id,
  targetTask,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue(Response.json({ id: "p", slug: "WEB" }));
});
describe("milestone candidate loading", () => {
  it("reads unassigned canonical Feature leaves, including unknown, planned and archived statuses", async () => {
    const a = link(task("a", 1));
    mocks.relations.mockResolvedValueOnce(
      Response.json([
        a,
        link(task("b", 2, "bug", "deleted-column")),
        link(task("c", 3, "task", "planned")),
        link(task("d", 4, "bug", "archived")),
        { ...a, id: "legacy-relation" },
        link(task("outside", 5, "task", "todo", "other")),
        link(task("feature", 6, "feature")),
        { ...a, id: "unrelated", relationType: "related" },
        link(task("other-feature", 7), "other"),
        link(task("assigned-task", 8, "task", "todo", "p", "existing")),
        link(task("assigned-bug", 9, "bug", "deleted-column", "p", "existing")),
      ]),
    );
    const data = await getMilestoneCandidates("p", "f");
    expect(data.projectSlug).toBe("WEB");
    expect(data.tasks.map((task) => task.id)).toEqual(["a", "b", "c", "d"]);
    expect(data.tasks[1]).toMatchObject({ type: "bug", milestoneId: null });
    expect(mocks.relations).toHaveBeenCalledWith(
      { param: { taskId: "f" } },
      { init: { signal: undefined } },
    );
    expect(mocks.project).toHaveBeenCalledWith(
      { param: { id: "p" } },
      { init: { signal: undefined } },
    );
  });
  it("returns no candidates when every task and bug is already assigned", async () => {
    mocks.relations.mockResolvedValueOnce(
      Response.json([
        link(task("assigned-task", 1, "task", "planned", "p", "existing")),
        link(task("assigned-bug", 2, "bug", "archived", "p", "another")),
      ]),
    );
    expect((await getMilestoneCandidates("p", "f")).tasks).toEqual([]);
  });
  it("retains complete schedules and archive status for selected-work date previews", async () => {
    mocks.relations.mockResolvedValueOnce(
      Response.json([
        link({
          ...task("t", 1),
          startDate: "2026-11-02T04:30:00Z",
          dueDate: "2026-11-06T18:00:00Z",
        }),
        link({
          ...task("b", 2, "bug", "archived"),
          startDate: null,
          dueDate: "2026-11-10T12:00:00Z",
        }),
      ]),
    );
    expect((await getMilestoneCandidates("p", "f")).tasks).toEqual([
      expect.objectContaining({
        id: "t",
        status: "todo",
        startDate: "2026-11-02T04:30:00Z",
        dueDate: "2026-11-06T18:00:00Z",
      }),
      expect.objectContaining({
        id: "b",
        status: "archived",
        startDate: null,
        dueDate: "2026-11-10T12:00:00Z",
      }),
    ]);
  });
  it("rejects unavailable relation summaries without returning a partial selection list", async () => {
    mocks.relations.mockResolvedValueOnce(
      new Response("unavailable", { status: 503 }),
    );
    await expect(getMilestoneCandidates("p", "f")).rejects.toMatchObject({
      status: 503,
    });
  });
  it("honors cancellation before starting requests", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      getMilestoneCandidates("p", "f", abort.signal),
    ).rejects.toThrow();
    expect(mocks.relations).not.toHaveBeenCalled();
    expect(mocks.project).not.toHaveBeenCalled();
  });
});
