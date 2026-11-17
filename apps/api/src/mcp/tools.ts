import {
  registerTools,
  type ToolAnnotations,
  type ToolRegistrar,
} from "@kaneo/mcp/tools";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { InternalApiClient } from "../utils/internal-api-client";

export type McpToolRegistrar = ToolRegistrar;

type ShapeToolServer = {
  registerTool(
    name: string,
    config: {
      description: string;
      inputSchema: z.ZodRawShape;
      annotations?: ToolAnnotations;
    },
    callback: (args: unknown) => Promise<CallToolResult>,
  ): unknown;
};

export function toMcpToolRegistrar(server: ShapeToolServer): McpToolRegistrar {
  return {
    registerTool: (name, config, callback) =>
      server.registerTool(
        name,
        {
          description: config.description,
          inputSchema: config.inputSchema.shape,
          annotations: config.annotations,
        },
        (args) => callback(args),
      ),
  };
}

export function registerMcpTools(
  server: McpToolRegistrar,
  baseUrl: string,
  token: string,
): void {
  registerTools(server, { client: new InternalApiClient({ baseUrl, token }) });
}
