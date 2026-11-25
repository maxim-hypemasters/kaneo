import { describe, expect, it, vi } from "vite-plus/test";
import { registerProjectLinkTools } from "./project-links.js";
import type { ToolRegistrar } from "./register.js";

type Registered = Parameters<ToolRegistrar["registerTool"]>;

function setup() {
  const tools = new Map<
    string,
    { config: Registered[1]; handler: Registered[2] }
  >();
  const client = {
    json: vi.fn(async (_path: string, _init?: RequestInit) => [
      { id: "link-1", title: "Spec", url: "https://example.com/spec" },
    ]),
  };
  registerProjectLinkTools(
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

describe("project link tools", () => {
  it("registers list_project_links as read-only", () => {
    const { tools } = setup();
    expect([...tools.keys()]).toEqual(["list_project_links"]);
    expect(tools.get("list_project_links")?.config.annotations).toEqual({
      readOnlyHint: true,
    });
  });

  it("lists a project's links", async () => {
    const { client, call } = setup();
    const result = await call("list_project_links", { projectId: " p/1 " });
    expect(client.json).toHaveBeenCalledWith(
      "/api/project-link/project/p%2F1",
      { method: "GET" },
    );
    expect(result.isError).toBe(false);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('"link-1"'),
    });
  });

  it.each([{}, { projectId: "  " }, { projectId: 1 }])(
    "rejects invalid input %j before calling the API",
    async (args) => {
      const { client, call } = setup();
      expect((await call("list_project_links", args)).isError).toBe(true);
      expect(client.json).not.toHaveBeenCalled();
    },
  );

  it("returns the API refusal as a tool error", async () => {
    const { client, call } = setup();
    client.json.mockRejectedValueOnce(new Error("Project not found"));
    const result = await call("list_project_links", { projectId: "p" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining("Project not found"),
    });
  });
});
