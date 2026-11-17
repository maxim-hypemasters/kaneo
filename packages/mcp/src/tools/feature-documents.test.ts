import { describe, expect, it, vi } from "vite-plus/test";
import { registerFeatureDocumentTools } from "./feature-documents.js";
import type { ToolRegistrar } from "./register.js";

type Handler = Parameters<ToolRegistrar["registerTool"]>[2];
type Config = Parameters<ToolRegistrar["registerTool"]>[1] & {
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

const document = {
  id: "d-1",
  featureId: "f-1",
  title: "Spec",
  body: "First.",
  revision: 2,
  updatedAt: "2026-11-16T10:00:00.000Z",
};
const written = {
  id: "d-1",
  featureId: "f-1",
  title: "Spec",
  revision: 2,
  updatedAt: "2026-11-16T10:00:00.000Z",
  totalLength: 6,
};
const path = "/api/feature/f%2F1/documents/d%2F1";

function setup(response: unknown = document) {
  const tools = new Map<string, { config: Config; handler: Handler }>();
  const client = {
    json: vi.fn(async (_path: string, _init?: RequestInit) => response),
  };
  registerFeatureDocumentTools(
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

describe("Feature document tools", () => {
  it("annotates reads and writes", () => {
    const { tools } = setup();
    expect(
      Object.fromEntries(
        [...tools].map(([name, tool]) => [name, tool.config.annotations]),
      ),
    ).toEqual({
      list_feature_documents: { readOnlyHint: true },
      get_feature_document: { readOnlyHint: true },
      create_feature_document: { readOnlyHint: false },
      update_feature_document: { readOnlyHint: false },
    });
  });

  it("lists a Feature's documents", async () => {
    const { client, call } = setup();
    await call("list_feature_documents", { featureId: "f/1" });
    expect(client.json).toHaveBeenCalledWith("/api/feature/f%2F1/documents", {
      method: "GET",
    });
  });

  it("searches and pages a Feature's documents", async () => {
    const { client, call } = setup();
    await call("list_feature_documents", {
      featureId: "f-1",
      search: "Spec",
      page: 2,
      limit: 10,
    });
    expect(client.json).toHaveBeenCalledWith(
      "/api/feature/f-1/documents?search=Spec&page=2&limit=10",
      { method: "GET" },
    );
  });

  it("refuses a page beyond 1,000,000", async () => {
    const { client, call } = setup();
    expect(
      (
        await call("list_feature_documents", {
          featureId: "f-1",
          page: 1_000_001,
        })
      ).isError,
    ).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("reads a document in slices with its revision", async () => {
    const { client, call } = setup({ ...document, body: "abcdefghij" });
    const result = await call("get_feature_document", {
      featureId: "f/1",
      documentId: "d/1",
      maxChars: 4,
    });
    expect(client.json).toHaveBeenCalledWith(path, { method: "GET" });
    expect(text(result)).toEqual({
      ...document,
      body: "abcd",
      offset: 0,
      totalLength: 10,
      truncated: true,
      nextOffset: 4,
    });
  });

  it("creates a document and returns its metadata, not its body", async () => {
    const { client, call, sent } = setup();
    const result = await call("create_feature_document", {
      featureId: "f/1",
      title: "Spec",
      body: "# Spec",
    });
    expect(client.json.mock.calls[0]?.[0]).toBe("/api/feature/f%2F1/documents");
    expect(client.json.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(sent(0)).toEqual({ title: "Spec", body: "# Spec" });
    expect(text(result)).toEqual(written);
  });

  it.each([
    [
      "create_feature_document",
      { featureId: "f-1", title: "Spec", keepRemovedAssets: false },
    ],
    [
      "update_feature_document",
      {
        featureId: "f-1",
        documentId: "d-1",
        body: "New",
        expectedRevision: 2,
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

  it("replaces the body with the expected revision and keeps attachments", async () => {
    const { client, call, sent } = setup();
    await call("update_feature_document", {
      featureId: "f/1",
      documentId: "d/1",
      title: "Spec v2",
      body: "New",
      expectedRevision: 2,
    });
    expect(client.json).toHaveBeenCalledTimes(1);
    expect(client.json.mock.calls[0]?.[0]).toBe(path);
    expect(client.json.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(sent(0)).toEqual({
      title: "Spec v2",
      body: "New",
      expectedRevision: 2,
      keepRemovedAssets: true,
    });
  });

  it("refuses a full replace without an expected revision", async () => {
    const { client, call } = setup();
    const result = await call("update_feature_document", {
      featureId: "f-1",
      documentId: "d-1",
      body: "New",
    });
    expect(result.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it.each([
    [{ featureId: "f-1", documentId: "d-1" }],
    [
      {
        featureId: "f-1",
        documentId: "d-1",
        body: "New",
        appendMarkdown: "More",
        expectedRevision: 2,
      },
    ],
  ])("refuses an update with no single change: %j", async (args) => {
    const { client, call } = setup();
    expect((await call("update_feature_document", args)).isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("appends to the current body at the fetched revision", async () => {
    const { client, call, sent } = setup();
    const result = await call("update_feature_document", {
      featureId: "f/1",
      documentId: "d/1",
      appendMarkdown: "- Second",
    });
    expect(
      client.json.mock.calls.map(([p, init]) => [p, init?.method]),
    ).toEqual([
      [path, "GET"],
      [path, "PUT"],
    ]);
    expect(sent(1)).toEqual({
      body: "First.\n\n- Second",
      expectedRevision: 2,
      keepRemovedAssets: true,
    });
    expect(text(result)).toEqual(written);
  });

  it("renames without touching the body", async () => {
    const { client, call, sent } = setup();
    await call("update_feature_document", {
      featureId: "f-1",
      documentId: "d-1",
      title: "Renamed",
    });
    expect(client.json.mock.calls[0]?.[1]).toEqual({ method: "GET" });
    expect(sent(1)).toEqual({
      title: "Renamed",
      expectedRevision: 2,
      keepRemovedAssets: true,
    });
  });

  it("renames at a caller's expected revision without reading first", async () => {
    const { client, call, sent } = setup();
    await call("update_feature_document", {
      featureId: "f-1",
      documentId: "d-1",
      title: "Renamed",
      expectedRevision: 1,
    });
    expect(client.json).toHaveBeenCalledTimes(1);
    expect(sent(0)).toEqual({
      title: "Renamed",
      expectedRevision: 1,
      keepRemovedAssets: true,
    });
  });

  it("passes a document conflict back as an error", async () => {
    const { client, call } = setup();
    client.json
      .mockResolvedValueOnce(document)
      .mockRejectedValueOnce(
        new Error(
          `${path}: The document changed since editing began (DOCUMENT_CONFLICT)`,
        ),
      );
    const result = await call("update_feature_document", {
      featureId: "f/1",
      documentId: "d/1",
      appendMarkdown: "More",
    });
    expect(result.isError).toBe(true);
    expect(text(result).error).toContain("DOCUMENT_CONFLICT");
  });
});
