import { describe, expect, it, vi } from "vite-plus/test";
import { registerProjectPageTools } from "./project-pages.js";
import type { ToolRegistrar } from "./register.js";

type Handler = Parameters<ToolRegistrar["registerTool"]>[2];
type Config = Parameters<ToolRegistrar["registerTool"]>[1] & {
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

const page = {
  id: "pg-1",
  projectId: "p-1",
  parentId: null,
  position: 0,
  title: "Plan",
  body: "First.",
  revision: 4,
  updatedByName: "Ada",
  updatedAt: "2026-11-16T10:00:00.000Z",
};
const written = {
  id: "pg-1",
  projectId: "p-1",
  parentId: null,
  title: "Plan",
  revision: 4,
  updatedAt: "2026-11-16T10:00:00.000Z",
  totalLength: 6,
};

function setup(response: unknown = page) {
  const tools = new Map<string, { config: Config; handler: Handler }>();
  const client = {
    json: vi.fn(async (_path: string, _init?: RequestInit) => response),
  };
  registerProjectPageTools(
    {
      registerTool(name, config, handler) {
        tools.set(name, { config, handler });
      },
    },
    client,
  );
  const call = (name: string, args: unknown) => tools.get(name)!.handler(args);
  const sent = (index: number) =>
    JSON.parse(String(client.json.mock.calls[index]?.[1]?.body));
  return { tools, client, call, sent };
}

const text = (result: { content: Array<{ type: string }> }) =>
  JSON.parse((result.content[0] as { text: string }).text);

describe("project page tools", () => {
  it("annotates reads and writes", () => {
    const { tools } = setup();
    expect(
      Object.fromEntries(
        [...tools].map(([name, tool]) => [name, tool.config.annotations]),
      ),
    ).toEqual({
      list_project_pages: { readOnlyHint: true },
      get_project_page: { readOnlyHint: true },
      create_project_page: { readOnlyHint: false },
      update_project_page: { readOnlyHint: false },
    });
  });

  it("lists the project's page tree", async () => {
    const { client, call } = setup();
    await call("list_project_pages", { projectId: "p/1" });
    expect(client.json).toHaveBeenCalledWith(
      "/api/project-document/project/p%2F1",
      { method: "GET" },
    );
  });

  it("reads a page in slices with its revision", async () => {
    const { client, call } = setup({ ...page, body: "abcdefghij" });
    const result = await call("get_project_page", {
      pageId: "pg/1",
      offset: 2,
      maxChars: 3,
    });
    expect(client.json).toHaveBeenCalledWith("/api/project-document/pg%2F1", {
      method: "GET",
    });
    expect(text(result)).toEqual({
      ...page,
      body: "cde",
      offset: 2,
      totalLength: 10,
      truncated: true,
      nextOffset: 5,
    });
  });

  it("reports a whole page as not truncated", async () => {
    const { call } = setup();
    expect(text(await call("get_project_page", { pageId: "pg-1" }))).toEqual({
      ...page,
      offset: 0,
      totalLength: 6,
      truncated: false,
      nextOffset: null,
    });
  });

  it("rejects page sizes above 30,000 characters", async () => {
    const { client, call } = setup();
    expect(
      (await call("get_project_page", { pageId: "pg-1", maxChars: 30_001 }))
        .isError,
    ).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("creates a nested page and returns its metadata, not its body", async () => {
    const { client, call, sent } = setup();
    const result = await call("create_project_page", {
      projectId: "p/1",
      title: " Plan ",
      body: "# Plan",
      parentId: "pg-0",
    });
    expect(client.json.mock.calls[0]?.[0]).toBe(
      "/api/project-document/project/p%2F1",
    );
    expect(client.json.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(sent(0)).toEqual({
      title: "Plan",
      body: "# Plan",
      parentId: "pg-0",
    });
    expect(text(result)).toEqual(written);
  });

  it.each([
    [
      "create_project_page",
      { projectId: "p-1", title: "Plan", keepRemovedAssets: false },
    ],
    [
      "update_project_page",
      {
        pageId: "pg-1",
        body: "New",
        expectedRevision: 4,
        keepRemovedAssets: false,
      },
    ],
  ])("%s rejects unknown fields", async (name, args) => {
    const { client, call } = setup();
    const result = await call(name, args);
    expect(result.isError).toBe(true);
    expect(text(result).error).toContain("keepRemovedAssets");
    expect(client.json).not.toHaveBeenCalled();
  });

  it("creates a top-level page with an empty body by default", async () => {
    const { call, sent } = setup();
    await call("create_project_page", { projectId: "p-1", title: "Plan" });
    expect(sent(0)).toEqual({ title: "Plan", body: "" });
  });

  it("replaces the body with the expected revision and keeps attachments", async () => {
    const { client, call, sent } = setup();
    const result = await call("update_project_page", {
      pageId: "pg/1",
      body: "New",
      expectedRevision: 4,
    });
    expect(client.json).toHaveBeenCalledTimes(1);
    expect(client.json.mock.calls[0]?.[0]).toBe("/api/project-document/pg%2F1");
    expect(client.json.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(sent(0)).toEqual({
      body: "New",
      expectedRevision: 4,
      keepRemovedAssets: true,
    });
    expect(text(result)).toEqual(written);
  });

  it("refuses a full replace without an expected revision", async () => {
    const { client, call } = setup();
    const result = await call("update_project_page", {
      pageId: "pg-1",
      body: "New",
    });
    expect(result.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it.each([
    [{ pageId: "pg-1" }],
    [
      {
        pageId: "pg-1",
        body: "New",
        appendMarkdown: "More",
        expectedRevision: 4,
      },
    ],
  ])("refuses an update with no single change: %j", async (args) => {
    const { client, call } = setup();
    expect((await call("update_project_page", args)).isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("appends to the current body at the fetched revision", async () => {
    const { client, call, sent } = setup();
    await call("update_project_page", {
      pageId: "pg-1",
      appendMarkdown: "- Second",
    });
    expect(
      client.json.mock.calls.map(([path, init]) => [path, init?.method]),
    ).toEqual([
      ["/api/project-document/pg-1", "GET"],
      ["/api/project-document/pg-1", "PUT"],
    ]);
    expect(sent(1)).toEqual({
      body: "First.\n\n- Second",
      expectedRevision: 4,
      keepRemovedAssets: true,
    });
  });

  it("appends against a caller's expected revision when given", async () => {
    const { call, sent } = setup();
    await call("update_project_page", {
      pageId: "pg-1",
      title: "Renamed",
      appendMarkdown: "More",
      expectedRevision: 3,
    });
    expect(sent(1)).toEqual({
      title: "Renamed",
      body: "First.\n\nMore",
      expectedRevision: 3,
      keepRemovedAssets: true,
    });
  });

  it("renames without touching the body", async () => {
    const { client, call, sent } = setup();
    await call("update_project_page", { pageId: "pg-1", title: "Renamed" });
    expect(client.json.mock.calls[0]?.[1]).toEqual({ method: "GET" });
    expect(sent(1)).toEqual({
      title: "Renamed",
      expectedRevision: 4,
      keepRemovedAssets: true,
    });
  });

  it("passes a document conflict back as an error", async () => {
    const { client, call } = setup();
    client.json.mockRejectedValueOnce(
      new Error(
        "/api/project-document/pg-1: The document changed since editing began (DOCUMENT_CONFLICT)",
      ),
    );
    const result = await call("update_project_page", {
      pageId: "pg-1",
      body: "New",
      expectedRevision: 3,
    });
    expect(result.isError).toBe(true);
    expect(text(result).error).toContain("DOCUMENT_CONFLICT");
  });
});
