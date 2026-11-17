import { describe, expect, it, vi } from "vite-plus/test";
import { registerFeatureInsightTools } from "./feature-insights.js";
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
  registerFeatureInsightTools(
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

describe("Feature insight tools", () => {
  it("marks reads read-only and the update post as a write", () => {
    const { tools } = setup();
    expect(
      Object.fromEntries(
        [...tools].map(([name, { config }]) => [name, config.annotations]),
      ),
    ).toEqual({
      get_latest_feature_update: { readOnlyHint: true },
      post_feature_update: { readOnlyHint: false },
      list_feature_issues: { readOnlyHint: true },
      list_feature_activity: { readOnlyHint: true },
    });
  });

  it("reads the latest published update", async () => {
    const { client, call } = setup();
    await call("get_latest_feature_update", { featureId: "f/1" });
    expect(client.json).toHaveBeenCalledWith(
      "/api/feature/f%2F1/updates/latest",
      { method: "GET" },
    );
  });

  it("posts a health and trimmed note", async () => {
    const { client, call } = setup();
    await call("post_feature_update", {
      featureId: "f/1",
      health: "at-risk",
      note: "  **Slipping** a week ",
    });
    expect(client.json).toHaveBeenCalledWith("/api/feature/f%2F1/updates", {
      method: "POST",
      body: JSON.stringify({ note: "**Slipping** a week", health: "at-risk" }),
    });
  });

  it.each([
    { featureId: "f", health: "late", note: "x" },
    { featureId: "f", health: "on-track", note: "  " },
    { featureId: "f", health: "on-track", note: "x".repeat(100_001) },
    { featureId: "f", health: "on-track", note: "x", milestones: [] },
  ])("rejects an invalid update before writing: %#", async (args) => {
    const { client, call } = setup();
    expect((await call("post_feature_update", args)).isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("lists Feature issues with bounded filters", async () => {
    const { client, call } = setup();
    await call("list_feature_issues", {
      featureId: "f/1",
      search: " login ",
      milestoneId: "none",
      archived: "include",
      page: 2,
      limit: 25,
    });
    expect(client.json).toHaveBeenCalledWith(
      "/api/feature/f%2F1/issues?search=login&milestoneId=none&archived=include&page=2&limit=25",
      { method: "GET" },
    );
    client.json.mockClear();
    await call("list_feature_issues", { featureId: "f" });
    expect(client.json).toHaveBeenCalledWith("/api/feature/f/issues", {
      method: "GET",
    });
  });

  it.each([
    ["list_feature_issues", { featureId: "f", limit: 101 }],
    ["list_feature_issues", { featureId: "f", archived: "all" }],
    ["list_feature_issues", { featureId: "f", page: 0 }],
    ["list_feature_activity", { featureId: "f", limit: 0 }],
    ["list_feature_activity", { featureId: " " }],
  ])("rejects out-of-range %s queries", async (name, args) => {
    const { client, call } = setup();
    expect((await call(name, args)).isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("pages Feature activity", async () => {
    const { client, call } = setup();
    await call("list_feature_activity", { featureId: "f/1", limit: 10 });
    expect(client.json).toHaveBeenCalledWith(
      "/api/feature/f%2F1/activity?limit=10",
      { method: "GET" },
    );
    client.json.mockClear();
    await call("list_feature_activity", { featureId: "f", page: 3 });
    expect(client.json).toHaveBeenCalledWith("/api/feature/f/activity?page=3", {
      method: "GET",
    });
  });

  it("returns API failures as tool errors", async () => {
    const { client, call } = setup();
    client.json.mockRejectedValueOnce(new Error("Feature not found"));
    const result = await call("get_latest_feature_update", { featureId: "f" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Feature not found");
  });
});
