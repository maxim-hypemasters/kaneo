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

describe("test case comment tools", () => {
  it.each([
    [
      "list_test_case_comments",
      { testCaseId: "t/1" },
      "/api/test-case/t%2F1/comments",
      "GET",
      undefined,
    ],
    [
      "create_test_case_comment",
      { testCaseId: "t", content: " Fails on Safari " },
      "/api/test-case/t/comments",
      "POST",
      { content: "Fails on Safari" },
    ],
    [
      "update_test_case_comment",
      { testCaseId: "t", commentId: "c/1", content: "Fixed" },
      "/api/test-case/t/comments/c%2F1",
      "PATCH",
      { content: "Fixed" },
    ],
    [
      "delete_test_case_comment",
      { testCaseId: "t", commentId: "c" },
      "/api/test-case/t/comments/c",
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
    ["list_test_case_comments", {}],
    ["create_test_case_comment", { testCaseId: "t", content: " " }],
    ["update_test_case_comment", { testCaseId: "t", content: "x" }],
    ["delete_test_case_comment", { testCaseId: "t" }],
  ])("%s rejects invalid input without a request", async (name, args) => {
    const { client, tools } = setup();
    const result = await tools.get(name)!.handler(args);
    expect(result.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("marks deletion as destructive", () => {
    const { tools } = setup();
    expect(
      tools.get("delete_test_case_comment")!.config.annotations,
    ).toMatchObject({ destructiveHint: true });
  });
});
