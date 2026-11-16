import { describe, expect, it, vi } from "vite-plus/test";
import { registerTools, type ToolRegistrar } from "./register.js";

type Registered = {
  description: string;
  handler: Parameters<ToolRegistrar["registerTool"]>[2];
};

function setup() {
  const tools = new Map<string, Registered>();
  const client = {
    json: vi.fn(async () => ({ id: "t/1", status: "to-do" })),
  };
  registerTools(
    {
      registerTool(name, config, handler) {
        tools.set(name, { description: config.description, handler });
      },
    },
    { client: client as never },
  );
  return { tools, client };
}

describe("triage tools", () => {
  it("accepts a task waiting in Triage", async () => {
    const { tools, client } = setup();
    const result = await tools
      .get("accept_triage_task")
      ?.handler({ taskId: "t/1" });
    expect(client.json).toHaveBeenCalledWith("/api/triage/task/t%2F1/accept", {
      method: "POST",
    });
    expect(result?.isError).toBe(false);
  });

  it("declines with an optional reason", async () => {
    const { tools, client } = setup();
    await tools
      .get("decline_triage_task")
      ?.handler({ taskId: "t/1", reason: "  Duplicate of KAN-4 " });
    await tools.get("decline_triage_task")?.handler({ taskId: "t/1" });
    expect(client.json.mock.calls).toEqual([
      [
        "/api/triage/task/t%2F1/decline",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Duplicate of KAN-4" }),
        },
      ],
      [
        "/api/triage/task/t%2F1/decline",
        { method: "POST", body: JSON.stringify({}) },
      ],
    ]);
  });

  it("validates input before calling the API", async () => {
    const { tools, client } = setup();
    for (const [name, args] of [
      ["accept_triage_task", {}],
      ["decline_triage_task", { taskId: " " }],
      ["decline_triage_task", { taskId: "t", reason: "   " }],
    ] as const) {
      expect((await tools.get(name)?.handler(args))?.isError).toBe(true);
    }
    expect(client.json).not.toHaveBeenCalled();
  });

  it("returns the API refusal for work that is not in Triage", async () => {
    const { tools, client } = setup();
    client.json.mockRejectedValueOnce(
      new Error("The task is not waiting in Triage"),
    );
    const result = await tools
      .get("accept_triage_task")
      ?.handler({ taskId: "t" });
    expect(result?.isError).toBe(true);
    expect(result?.content[0]).toMatchObject({
      text: expect.stringContaining("not waiting in Triage"),
    });
  });

  it("points status tools at accept and decline for Triage work", () => {
    const { tools } = setup();
    for (const name of ["list_tasks", "update_task", "update_task_status"]) {
      expect(tools.get(name)?.description).toContain("accept_triage_task");
      expect(tools.get(name)?.description).toContain("decline_triage_task");
    }
    expect(tools.get("list_tasks")?.description).toContain("data.triageTasks");
  });
});
