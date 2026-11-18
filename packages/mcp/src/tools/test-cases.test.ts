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

describe("test case tools", () => {
  it.each([
    [
      "list_test_cases",
      { projectId: "p/1", status: "failed", milestoneId: "none", page: 2 },
      "/api/test-case/project/p%2F1?status=failed&milestoneId=none&page=2",
      "GET",
      undefined,
    ],
    [
      "list_feature_test_cases",
      { featureId: "f" },
      "/api/test-case/feature/f",
      "GET",
      undefined,
    ],
    [
      "list_release_test_cases",
      { releaseId: "r", status: "passed", limit: 10 },
      "/api/test-case/release/r?status=passed&limit=10",
      "GET",
      undefined,
    ],
    [
      "get_test_case",
      { testCaseId: "t" },
      "/api/test-case/t",
      "GET",
      undefined,
    ],
    [
      "create_test_case",
      { projectId: "p", title: " Pay ", bugId: "b", steps: "1. Pay" },
      "/api/test-case/project/p",
      "POST",
      { title: "Pay", steps: "1. Pay", bugId: "b" },
    ],
    [
      "update_test_case",
      { testCaseId: "t", status: "passed", milestoneId: null },
      "/api/test-case/t",
      "PATCH",
      { status: "passed", milestoneId: null },
    ],
    [
      "delete_test_case",
      { testCaseId: "t" },
      "/api/test-case/t",
      "DELETE",
      undefined,
    ],
  ])("%s calls the API", async (name, args, path, method, body) => {
    const { client, tools } = setup();
    await tools.get(String(name))!.handler(args);
    expect(client.json).toHaveBeenCalledWith(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  });

  it.each([
    ["list_test_cases", {}],
    ["list_release_test_cases", { releaseId: "r", status: "skipped" }],
    ["create_test_case", { projectId: "p", title: " " }],
    ["create_test_case", { projectId: "p", title: "x", status: "skipped" }],
    ["update_test_case", { testCaseId: "t" }],
  ])("%s rejects invalid input without a request", async (name, args) => {
    const { client, tools } = setup();
    const result = await tools.get(name)!.handler(args);
    expect(result.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("marks deletion as destructive", () => {
    const { tools } = setup();
    expect(tools.get("delete_test_case")!.config.annotations).toMatchObject({
      destructiveHint: true,
    });
  });
});
