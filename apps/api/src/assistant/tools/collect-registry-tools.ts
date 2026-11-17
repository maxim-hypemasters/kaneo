import {
  registerTools,
  type ToolAnnotations,
  type ToolClient,
} from "@kaneo/mcp/tools";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

export type RegistryTool = {
  description: string;
  schema: z.ZodObject;
  annotations?: ToolAnnotations;
  run(args: unknown): Promise<CallToolResult>;
};

/** Every tool of the shared MCP registry, bound to `client`. */
export function collectRegistryTools(
  client: ToolClient,
): Map<string, RegistryTool> {
  const tools = new Map<string, RegistryTool>();
  registerTools(
    {
      registerTool: (name, config, callback) => {
        tools.set(name, {
          description: config.description,
          schema: config.inputSchema,
          annotations: config.annotations,
          run: callback,
        });
      },
    },
    { client },
  );
  return tools;
}

const unboundClient: ToolClient = {
  json: () => Promise.reject(new Error("Registry metadata cannot run tools")),
};
let metadata: ReadonlyMap<string, RegistryTool> | null = null;

/** Names, descriptions, schemas and annotations, collected once per process. */
export function registryToolMetadata(): ReadonlyMap<string, RegistryTool> {
  metadata ??= collectRegistryTools(unboundClient);
  return metadata;
}
