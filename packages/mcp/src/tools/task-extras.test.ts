import { describe, expect, it, vi } from "vite-plus/test";
import type { ToolRegistrar } from "./register.js";
import { registerTaskExtraTools } from "./task-extras.js";

type Registered = Parameters<ToolRegistrar["registerTool"]>;
type Page = { content: string; version: string; nextOffset: number | null };

function setup(pages: Record<string, Page> = {}) {
  const tools = new Map<
    string,
    { config: Registered[1]; handler: Registered[2] }
  >();
  const client = {
    json: vi.fn(async (path: string, _init?: RequestInit): Promise<unknown> => {
      if (path.includes("/description?")) {
        const page = pages[path];
        if (!page) throw new Error(`${path}: Description changed`);
        return page;
      }
      return { ok: true };
    }),
  };
  registerTaskExtraTools(
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

function output(result: Awaited<ReturnType<Registered[2]>>) {
  const [content] = result.content;
  return JSON.parse(content?.type === "text" ? content.text : "null");
}

function sentBody(client: ReturnType<typeof setup>["client"], index: number) {
  return JSON.parse(String(client.json.mock.calls[index]?.[1]?.body));
}

describe("task extra tools", () => {
  it("annotates every read and write", () => {
    const { tools } = setup();
    expect(
      Object.fromEntries(
        [...tools].map(([name, { config }]) => [name, config.annotations]),
      ),
    ).toEqual({
      get_task_description: { readOnlyHint: true },
      update_task_description: { readOnlyHint: false },
      get_task_custom_fields: { readOnlyHint: true },
      set_task_custom_field_value: { readOnlyHint: false },
      list_task_external_links: { readOnlyHint: true },
      create_task_external_link: { readOnlyHint: false },
    });
  });

  describe("get_task_description", () => {
    it("reads the first page and reports the full length when it is the last", async () => {
      const { client, call } = setup({
        "/api/task/t%2F1/description?offset=0": {
          content: "Hello",
          version: "42",
          nextOffset: null,
        },
      });
      const result = output(
        await call("get_task_description", { taskId: "t/1" }),
      );
      expect(client.json).toHaveBeenCalledWith(
        "/api/task/t%2F1/description?offset=0",
        { method: "GET" },
      );
      expect(result).toEqual({
        taskId: "t/1",
        offset: 0,
        content: "Hello",
        version: "42",
        nextOffset: null,
        truncated: false,
        totalLength: 5,
      });
    });

    it("reports a later page as truncated even when it is the last", async () => {
      const { call } = setup({
        "/api/task/t/description?offset=32768&version=42": {
          content: "middle",
          version: "42",
          nextOffset: 65536,
        },
        "/api/task/t/description?offset=65536&version=42": {
          content: "a😀",
          version: "42",
          nextOffset: null,
        },
      });
      expect(
        output(
          await call("get_task_description", {
            taskId: "t",
            offset: 32768,
            version: "42",
          }),
        ),
      ).toMatchObject({
        truncated: true,
        nextOffset: 65536,
        totalLength: null,
      });
      expect(
        output(
          await call("get_task_description", {
            taskId: "t",
            offset: 65536,
            version: "42",
          }),
        ),
      ).toMatchObject({ nextOffset: null, truncated: true, totalLength: null });
    });

    it.each([
      { taskId: "t", offset: -1 },
      { taskId: "t", offset: 1.5 },
      { taskId: "t", version: "v1" },
    ])("rejects invalid paging %#", async (args) => {
      const { client, call } = setup();
      expect((await call("get_task_description", args)).isError).toBe(true);
      expect(client.json).not.toHaveBeenCalled();
    });
  });

  describe("update_task_description", () => {
    it("replaces against the expected description and keeps removed uploads", async () => {
      const { client, call } = setup();
      await call("update_task_description", {
        taskId: "t/1",
        description: "New",
        expectedDescription: "Old",
      });
      expect(client.json).toHaveBeenCalledTimes(1);
      expect(client.json.mock.calls[0]?.[0]).toBe(
        "/api/task/description/t%2F1",
      );
      expect(client.json.mock.calls[0]?.[1]?.method).toBe("PUT");
      expect(sentBody(client, 0)).toEqual({
        description: "New",
        expectedDescription: "Old",
        keepRemovedAssets: true,
      });
    });

    it("returns the task without its description, with the description's length", async () => {
      const { client, call } = setup();
      client.json.mockResolvedValueOnce({
        id: "t",
        title: "Fix login",
        description: "New 😀",
      });
      const result = await call("update_task_description", {
        taskId: "t",
        description: "New 😀",
        expectedDescription: "Old",
      });
      expect(result.isError).toBe(false);
      expect(output(result)).toEqual({
        id: "t",
        title: "Fix login",
        descriptionLength: 5,
      });
    });

    it("appends to the full current description read across pages", async () => {
      const { client, call } = setup({
        "/api/task/t/description?offset=0": {
          content: "Intro",
          version: "9",
          nextOffset: 32768,
        },
        "/api/task/t/description?offset=32768&version=9": {
          content: " and more\n",
          version: "9",
          nextOffset: null,
        },
      });
      const result = await call("update_task_description", {
        taskId: "t",
        appendMarkdown: "  ## Next steps ",
      });
      expect(result.isError).toBe(false);
      expect(client.json.mock.calls.map(([path]) => path)).toEqual([
        "/api/task/t/description?offset=0",
        "/api/task/t/description?offset=32768&version=9",
        "/api/task/description/t",
      ]);
      expect(client.json.mock.calls[2]?.[1]?.method).toBe("PUT");
      expect(sentBody(client, 2)).toEqual({
        description: "Intro and more\n\n## Next steps",
        expectedDescription: "Intro and more\n",
        keepRemovedAssets: true,
      });
    });

    it("appends to an empty description", async () => {
      const { client, call } = setup({
        "/api/task/t/description?offset=0": {
          content: "",
          version: "1",
          nextOffset: null,
        },
      });
      await call("update_task_description", {
        taskId: "t",
        appendMarkdown: "First",
      });
      expect(sentBody(client, 1)).toEqual({
        description: "First",
        expectedDescription: "",
        keepRemovedAssets: true,
      });
    });

    it("writes nothing when the description changes while it is read", async () => {
      const { client, call } = setup({
        "/api/task/t/description?offset=0": {
          content: "Intro",
          version: "9",
          nextOffset: 32768,
        },
      });
      const result = await call("update_task_description", {
        taskId: "t",
        appendMarkdown: "More",
      });
      expect(result.isError).toBe(true);
      expect(output(result).error).toContain("Description changed");
      expect(client.json).toHaveBeenCalledTimes(2);
      expect(
        client.json.mock.calls.some(([, init]) => init?.method === "PUT"),
      ).toBe(false);
    });

    it("stops reading a description that never ends", async () => {
      const { client, call } = setup();
      client.json.mockImplementation(async () => ({
        content: "x",
        version: "1",
        nextOffset: 1,
      }));
      const result = await call("update_task_description", {
        taskId: "t",
        appendMarkdown: "More",
      });
      expect(result.isError).toBe(true);
      expect(client.json).toHaveBeenCalledTimes(64);
    });

    it.each([
      [
        "a full replace without expectedDescription",
        { taskId: "t", description: "New" },
      ],
      ["neither description nor appendMarkdown", { taskId: "t" }],
      [
        "both description and appendMarkdown",
        {
          taskId: "t",
          description: "New",
          appendMarkdown: "More",
          expectedDescription: "Old",
        },
      ],
      [
        "expectedDescription with an append",
        { taskId: "t", appendMarkdown: "More", expectedDescription: "Old" },
      ],
      ["a blank append", { taskId: "t", appendMarkdown: " \n " }],
      [
        "an unknown field",
        {
          taskId: "t",
          description: "New",
          expectedDescription: "Old",
          keepRemovedAssets: false,
        },
      ],
    ])("rejects %s before calling the API", async (_case, args) => {
      const { client, call } = setup();
      expect((await call("update_task_description", args)).isError).toBe(true);
      expect(client.json).not.toHaveBeenCalled();
    });
  });

  it("reads a task's custom field values", async () => {
    const { client, call } = setup();
    await call("get_task_custom_fields", { taskId: "t/1" });
    expect(client.json).toHaveBeenCalledWith("/api/custom-field/task/t%2F1", {
      method: "GET",
    });
  });

  it("sets a custom field value with the API body", async () => {
    const { client, call } = setup();
    await call("set_task_custom_field_value", {
      taskId: "t",
      fieldId: "f",
      value: '["A","B"]',
    });
    expect(client.json).toHaveBeenCalledWith("/api/custom-field/value", {
      method: "PUT",
      body: JSON.stringify({ taskId: "t", fieldId: "f", value: '["A","B"]' }),
    });
  });

  it.each([
    { taskId: "t", fieldId: "f" },
    { taskId: "t", fieldId: "f", value: 3 },
    { taskId: "t", fieldId: " ", value: "x" },
  ])("rejects an invalid custom field value %#", async (args) => {
    const { client, call } = setup();
    expect((await call("set_task_custom_field_value", args)).isError).toBe(
      true,
    );
    expect(client.json).not.toHaveBeenCalled();
  });

  it("lists and creates task external links", async () => {
    const { client, call } = setup();
    await call("list_task_external_links", { taskId: "t/1" });
    expect(client.json).toHaveBeenLastCalledWith(
      "/api/external-link/task/t%2F1",
      { method: "GET" },
    );
    await call("create_task_external_link", {
      taskId: "t/1",
      url: "https://example.com/spec",
      title: " Spec ",
    });
    expect(client.json).toHaveBeenLastCalledWith(
      "/api/external-link/task/t%2F1",
      {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/spec",
          title: "Spec",
        }),
      },
    );
  });

  it.each([
    { taskId: "t", url: "ftp://example.com/file" },
    { taskId: "t", url: "not a url" },
    { taskId: "t", url: "https://example.com", title: "x".repeat(201) },
  ])("rejects an invalid external link %#", async (args) => {
    const { client, call } = setup();
    expect((await call("create_task_external_link", args)).isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });
});
