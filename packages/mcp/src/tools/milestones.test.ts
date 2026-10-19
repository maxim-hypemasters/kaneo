import { describe, expect, it, vi } from "vite-plus/test";
import { registerTools } from "./register.js";
import type { ToolRegistrar } from "./register.js";

function setup() {
  const tools = new Map<
    string,
    {
      config: Parameters<ToolRegistrar["registerTool"]>[1];
      handler: Parameters<ToolRegistrar["registerTool"]>[2];
    }
  >();
  const server: ToolRegistrar = {
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
  const client = { json: vi.fn(async () => ({ ok: true })) };
  registerTools(server, { client: client as never });
  return { client, tools };
}
describe("milestone tools", () => {
  it.each([
    [
      "list_milestones",
      { featureId: "f/1" },
      "/api/milestone/feature/f%2F1",
      "GET",
      undefined,
    ],
    [
      "get_milestone",
      { milestoneId: "m/1" },
      "/api/milestone/m%2F1",
      "GET",
      undefined,
    ],
    [
      "create_milestone",
      {
        featureId: "f",
        title: " First ",
        startDate: "2026-10-20",
        endDate: "2026-11-01",
        taskIds: ["t", "b"],
      },
      "/api/milestone/feature/f",
      "POST",
      {
        title: "First",
        startDate: "2026-10-20",
        endDate: "2026-11-01",
        taskIds: ["t", "b"],
      },
    ],
    [
      "update_milestone",
      { milestoneId: "m", description: null, startDate: null, endDate: null },
      "/api/milestone/m",
      "PATCH",
      { description: null, startDate: null, endDate: null },
    ],
    [
      "delete_milestone",
      { milestoneId: "m" },
      "/api/milestone/m",
      "DELETE",
      undefined,
    ],
    [
      "reorder_milestones",
      { featureId: "f", milestoneIds: ["m2", "m1"] },
      "/api/milestone/feature/f/order",
      "PUT",
      { milestoneIds: ["m2", "m1"] },
    ],
    [
      "set_task_milestone",
      { taskId: "t", milestoneId: "m" },
      "/api/task/t/milestone",
      "PATCH",
      { milestoneId: "m" },
    ],
    [
      "set_task_milestone",
      { taskId: "t", milestoneId: null },
      "/api/task/t/milestone",
      "PATCH",
      { milestoneId: null },
    ],
  ])("%s uses the narrow contract", async (name, args, path, method, body) => {
    const { client, tools } = setup();
    await tools.get(String(name))!.handler(args);
    expect(client.json).toHaveBeenCalledWith(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  });
  it.each([
    ["create_milestone", { featureId: "f", title: " " }],
    [
      "create_milestone",
      { featureId: "f", title: "First", endDate: "2026-02-30" },
    ],
    ["update_milestone", { milestoneId: "m" }],
    [
      "create_milestone",
      { featureId: "f", title: "Ship", taskIds: ["t", "t"] },
    ],
    ["create_milestone", { featureId: "f", title: "Ship", taskIds: [""] }],
    [
      "create_milestone",
      {
        featureId: "f",
        title: "Ship",
        startDate: "2026-11-02",
        endDate: "2026-11-01",
      },
    ],
    [
      "update_milestone",
      { milestoneId: "m", startDate: "2026-11-02", endDate: "2026-11-01" },
    ],
    [
      "create_milestone",
      { featureId: "f", title: "Ship", startDate: "2026-02-30" },
    ],
    ["reorder_milestones", { featureId: "f", milestoneIds: ["m", "m"] }],
    ["set_task_milestone", { taskId: "t" }],
  ])("%s rejects invalid input without a request", async (name, args) => {
    const { client, tools } = setup();
    const result = await tools.get(name)!.handler(args);
    expect(result.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });
  it("preserves assignment and sends Feature/milestone filters before pagination", async () => {
    const { client, tools } = setup();
    await tools.get("create_task")!.handler({
      projectId: "p",
      title: "Bug",
      type: "bug",
      description: "",
      priority: "medium",
      status: "todo",
      featureId: "f",
      milestoneId: "m",
    });
    expect(client.json).toHaveBeenLastCalledWith("/api/task/p", {
      method: "POST",
      body: JSON.stringify({
        title: "Bug",
        description: "",
        priority: "medium",
        status: "todo",
        type: "bug",
        featureId: "f",
        milestoneId: "m",
      }),
    });
    await tools.get("list_tasks")!.handler({
      projectId: "p",
      featureId: "f",
      milestoneId: "none",
      page: 2,
    });
    const path = client.json.mock.calls.at(-1)?.[0] as string | undefined;
    const url = new URL(path!, "https://example.test");
    expect(url.searchParams.get("featureId")).toBe("f");
    expect(url.searchParams.get("milestoneId")).toBe("none");
    expect(url.searchParams.get("page")).toBe("2");
  });
});
