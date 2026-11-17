import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import type { ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

type Handler = Parameters<ToolRegistrar["registerTool"]>[2];

function setup(handler: (args: { id: string }) => Promise<unknown>) {
  let registered: { config: unknown; handler: Handler } | undefined;
  const config = {
    description: "Read a thing.",
    inputSchema: z.strictObject({ id: z.string().trim().min(1) }),
    annotations: { readOnlyHint: true },
  };
  registerTool(
    {
      registerTool(_name, toolConfig, toolHandler) {
        registered = { config: toolConfig, handler: toolHandler };
      },
    },
    "get_thing",
    config,
    handler,
  );
  return { config, registered: registered! };
}

const text = (result: Awaited<ReturnType<Handler>>) =>
  JSON.parse((result.content[0] as { text: string }).text);

describe("registerTool", () => {
  it("passes the config through and the parsed arguments to the handler", async () => {
    const handler = vi.fn(async (args: { id: string }) => ({ ok: args.id }));
    const { config, registered } = setup(handler);
    expect(registered.config).toBe(config);

    const result = await registered.handler({ id: " t-1 " });
    expect(handler).toHaveBeenCalledWith({ id: "t-1" });
    expect(result.isError).toBe(false);
    expect(text(result)).toEqual({ ok: "t-1" });
  });

  it("returns a validation error without calling the handler", async () => {
    const handler = vi.fn(async () => null);
    const { registered } = setup(handler);

    const result = await registered.handler({ id: "t-1", extra: true });
    expect(result.isError).toBe(true);
    expect(text(result).error).toContain("extra");
    expect(handler).not.toHaveBeenCalled();
  });

  it("turns a thrown error into an error result", async () => {
    const { registered } = setup(async () => {
      throw new Error("/api/thing/t-1: Not found");
    });

    const result = await registered.handler({ id: "t-1" });
    expect(result.isError).toBe(true);
    expect(text(result)).toEqual({ error: "/api/thing/t-1: Not found" });
  });

  it("turns a thrown non-error into an error result", async () => {
    const { registered } = setup(() => Promise.reject("offline"));

    expect(text(await registered.handler({ id: "t-1" }))).toEqual({
      error: "offline",
    });
  });
});
