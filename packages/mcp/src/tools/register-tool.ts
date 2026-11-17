import { z } from "zod";
import { errorResult, textResult } from "../utils/mcp-result.js";
import type { ToolAnnotations, ToolRegistrar } from "./register.js";

export type ToolConfig<S extends z.ZodObject> = {
  description: string;
  inputSchema: S;
  annotations: ToolAnnotations & { readOnlyHint: boolean };
};

/**
 * Registers a tool whose handler gets validated arguments. Invalid arguments
 * and thrown errors become MCP error results; anything else the handler
 * returns becomes a JSON text result.
 */
export function registerTool<S extends z.ZodObject>(
  server: ToolRegistrar,
  name: string,
  config: ToolConfig<S>,
  handler: (args: z.output<S>) => Promise<unknown>,
): void {
  server.registerTool(name, config, async (args) => {
    const parsed = config.inputSchema.safeParse(args);
    if (!parsed.success) return errorResult(z.prettifyError(parsed.error));
    try {
      return textResult(await handler(parsed.data));
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
