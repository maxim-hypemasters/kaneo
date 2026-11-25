import { describe, expect, it, vi } from "vite-plus/test";
import type { ToolRegistrar } from "./register.js";
import { registerTeamTools } from "./teams.js";

type Registered = Parameters<ToolRegistrar["registerTool"]>;

function setup() {
  const tools = new Map<
    string,
    { config: Registered[1]; handler: Registered[2] }
  >();
  const client = {
    json: vi.fn(async (_path: string, _init?: RequestInit) => [
      { id: "team-1", members: [], projects: [] },
    ]),
  };
  registerTeamTools(
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

describe("team tools", () => {
  it("registers list_teams as read-only", () => {
    const { tools } = setup();
    expect([...tools.keys()]).toEqual(["list_teams"]);
    expect(tools.get("list_teams")?.config.annotations).toEqual({
      readOnlyHint: true,
    });
  });

  it("lists a workspace's teams", async () => {
    const { client, call } = setup();
    const result = await call("list_teams", { workspaceId: " w/1 " });
    expect(client.json).toHaveBeenCalledWith("/api/team/workspace/w%2F1", {
      method: "GET",
    });
    expect(result.isError).toBe(false);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('"team-1"'),
    });
  });

  it.each([{}, { workspaceId: "  " }, { workspaceId: 1 }])(
    "rejects invalid input %j before calling the API",
    async (args) => {
      const { client, call } = setup();
      expect((await call("list_teams", args)).isError).toBe(true);
      expect(client.json).not.toHaveBeenCalled();
    },
  );

  it("returns the API refusal as a tool error", async () => {
    const { client, call } = setup();
    client.json.mockRejectedValueOnce(new Error("Workspace not found"));
    const result = await call("list_teams", { workspaceId: "w" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining("Workspace not found"),
    });
  });
});
