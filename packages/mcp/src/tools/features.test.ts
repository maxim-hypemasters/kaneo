import { describe, expect, it, vi } from "vite-plus/test";
import { registerTools, type ToolRegistrar } from "./register.js";

function setup() {
  const tools = new Map<string, Parameters<ToolRegistrar["registerTool"]>[2]>();
  const client = { json: vi.fn(async () => ({ ok: true })) };
  registerTools(
    {
      registerTool(name, _config, handler) {
        tools.set(name, handler);
      },
    },
    { client },
  );
  return { tools, client };
}
describe("knowledge Feature tools", () => {
  it("lists archived Feature metadata using bounded project pagination", async () => {
    const { tools, client } = setup();
    await tools.get("list_features")?.({
      projectId: "p/1",
      archived: true,
      search: "Combat",
      page: 2,
      limit: 25,
    });
    expect(client.json).toHaveBeenCalledWith(
      "/api/task/feature-library/p%2F1?archived=true&search=Combat&page=2&limit=25",
      { method: "GET" },
    );
  });
  it.each([true, false])(
    "sets the separate Feature archive state to %s",
    async (archived) => {
      const { tools, client } = setup();
      await tools.get("archive_feature")?.({ featureId: "f/1", archived });
      expect(client.json).toHaveBeenCalledWith(
        "/api/task/f%2F1/feature-archive",
        { method: "PUT", body: JSON.stringify({ archived }) },
      );
    },
  );
  it("rejects Feature conversion and Feature planning on create before writing", async () => {
    const { tools, client } = setup();
    expect(
      (await tools.get("set_task_type")?.({ taskId: "t", type: "feature" }))
        ?.isError,
    ).toBe(true);
    expect(
      (await tools.get("list_tasks")?.({ projectId: "p", type: "feature" }))
        ?.isError,
    ).toBe(true);
    for (const planning of [
      { status: "to-do" },
      { priority: "urgent" },
      { userId: "lead" },
      { releaseId: null },
      { startDate: "2026-10-20T00:00:00Z" },
    ]) {
      expect(
        (
          await tools.get("create_task")?.({
            projectId: "p",
            title: "Knowledge",
            description: "",
            type: "feature",
            ...planning,
          })
        )?.isError,
      ).toBe(true);
    }
    expect(client.json).not.toHaveBeenCalled();
  });
  it("lists project milestones with planning metadata and validated bounds", async () => {
    const { tools, client } = setup();
    await tools.get("list_project_milestones")?.({
      projectId: "p/1",
      page: 2,
      limit: 30,
    });
    expect(client.json).toHaveBeenCalledWith(
      "/api/milestone/project/p%2F1?page=2&limit=30",
      { method: "GET" },
    );
    client.json.mockClear();
    expect(
      (
        await tools.get("list_project_milestones")?.({
          projectId: "p",
          limit: 101,
        })
      )?.isError,
    ).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });
});
