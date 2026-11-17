import { describe, expect, it, vi } from "vite-plus/test";
import { registerProjectExtraTools } from "./project-extras.js";
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
  registerProjectExtraTools(
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

describe("project extra tools", () => {
  it("annotates reads and the details write", () => {
    const { tools } = setup();
    expect(
      Object.fromEntries(
        [...tools].map(([name, { config }]) => [name, config.annotations]),
      ),
    ).toEqual({
      update_project_details: { readOnlyHint: false },
      list_custom_fields: { readOnlyHint: true },
      list_release_milestones: { readOnlyHint: true },
    });
  });

  it("patches only the given project details", async () => {
    const { client, call } = setup();
    await call("update_project_details", {
      projectId: "p/1",
      name: " Launch ",
    });
    expect(client.json).toHaveBeenCalledWith("/api/project/p%2F1/details", {
      method: "PATCH",
      body: JSON.stringify({ name: "Launch" }),
    });
    client.json.mockClear();
    await call("update_project_details", {
      projectId: "p",
      name: "Launch",
      description: "",
    });
    expect(client.json).toHaveBeenCalledWith("/api/project/p/details", {
      method: "PATCH",
      body: JSON.stringify({ name: "Launch", description: "" }),
    });
  });

  it.each([
    { projectId: "p" },
    { projectId: "p", name: "  " },
    { projectId: "p", name: "x".repeat(256) },
    { projectId: "p", description: "x".repeat(10_001) },
    { projectId: "p", name: "Launch", key: "LCH" },
  ])("rejects invalid details before writing: %#", async (args) => {
    const { client, call } = setup();
    expect((await call("update_project_details", args)).isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("lists a project's custom field definitions", async () => {
    const { client, call } = setup();
    await call("list_custom_fields", { projectId: "p/1" });
    expect(client.json).toHaveBeenCalledWith(
      "/api/custom-field/project/p%2F1",
      {
        method: "GET",
      },
    );
  });

  it("lists release milestones in an optional time zone", async () => {
    const { client, call } = setup();
    await call("list_release_milestones", { releaseId: "r/1" });
    expect(client.json).toHaveBeenCalledWith("/api/release/r%2F1/milestones", {
      method: "GET",
    });
    client.json.mockClear();
    await call("list_release_milestones", {
      releaseId: "r",
      timeZone: "Europe/Belgrade",
    });
    expect(client.json).toHaveBeenCalledWith(
      "/api/release/r/milestones?timeZone=Europe%2FBelgrade",
      { method: "GET" },
    );
  });

  it.each([
    ["list_custom_fields", {}],
    ["list_release_milestones", { releaseId: "r", timeZone: "" }],
  ])("rejects invalid %s input before calling the API", async (name, args) => {
    const { client, call } = setup();
    expect((await call(name, args)).isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });
});
