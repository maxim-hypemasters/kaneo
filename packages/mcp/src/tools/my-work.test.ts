import { describe, expect, it, vi } from "vite-plus/test";
import { registerMyWorkTools } from "./my-work.js";
import type { ToolRegistrar } from "./register.js";

type Registered = Parameters<ToolRegistrar["registerTool"]>;

function setup() {
  const tools = new Map<
    string,
    { config: Registered[1]; handler: Registered[2] }
  >();
  const client = {
    json: vi.fn(async (_path: string, _init?: RequestInit) => ({ ok: true })),
  };
  registerMyWorkTools(
    {
      registerTool(name, config, handler) {
        tools.set(name, { config, handler });
      },
    },
    client as never,
  );
  const call = (name: string, args: unknown) => tools.get(name)!.handler(args);
  return { tools, client, call };
}

describe("my work tools", () => {
  it("marks both tools read-only", () => {
    const { tools } = setup();
    expect([...tools.keys()]).toEqual([
      "list_my_tasks",
      "list_workspace_activity",
    ]);
    for (const { config } of tools.values())
      expect(config.annotations).toEqual({ readOnlyHint: true });
  });

  it("lists the caller's assigned tasks in a workspace", async () => {
    const { client, call } = setup();
    await call("list_my_tasks", { workspaceId: "w&1" });
    expect(client.json).toHaveBeenCalledWith(
      "/api/task/assigned?workspaceId=w%261",
      { method: "GET" },
    );
    client.json.mockClear();
    await call("list_my_tasks", { workspaceId: "w", countOnly: true });
    expect(client.json).toHaveBeenCalledWith(
      "/api/task/assigned?workspaceId=w&countOnly=true",
      { method: "GET" },
    );
  });

  it("reads recent workspace activity", async () => {
    const { client, call } = setup();
    await call("list_workspace_activity", { workspaceId: "w/1" });
    expect(client.json).toHaveBeenCalledWith("/api/activity/workspace/w%2F1", {
      method: "GET",
    });
  });

  it.each([
    ["list_my_tasks", {}],
    ["list_my_tasks", { workspaceId: "w", countOnly: "yes" }],
    ["list_workspace_activity", { workspaceId: "  " }],
  ])("rejects invalid %s input before calling the API", async (name, args) => {
    const { client, call } = setup();
    expect((await call(name, args)).isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });
});
