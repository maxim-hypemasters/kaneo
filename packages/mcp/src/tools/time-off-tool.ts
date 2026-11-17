import { z } from "zod";
import { errorResult, textResult } from "../utils/mcp-result.js";
import type { ToolRegistrar } from "./register.js";

// Building blocks shared by the time off and holiday calendar tools.

export const id = z.string().trim().min(1);
export const workspaceId = id.describe("Workspace ID, from list_workspaces.");
export const year = z
  .number()
  .int()
  .min(1970)
  .max(9999)
  .optional()
  .describe("Jan-Dec allowance year. Defaults to the current UTC year.");
export const memberId = id
  .optional()
  .describe(
    "Member user ID, from list_workspace_members. Omit it for yourself; anyone else needs time_off:approve.",
  );

export const lang = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/)
  .optional()
  .describe(
    "Language of holiday and country names, such as de or de-DE. Defaults to en.",
  );

export function withQuery(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) query.set(key, String(value));
  return `${path}${query.size ? `?${query}` : ""}`;
}

export const workspacePath = (workspace: string) =>
  `/api/time-off/workspace/${encodeURIComponent(workspace)}`;

// Registers a tool that validates its input, sends one request and returns
// the response, or the API error as a tool error.
export function timeOffToolRegistrar(server: ToolRegistrar) {
  return function register<S extends z.ZodObject>(
    name: string,
    summary: string,
    schema: S,
    request: (args: z.output<S>) => Promise<unknown>,
  ) {
    server.registerTool(
      name,
      { description: summary, inputSchema: schema },
      async (args) => {
        const parsed = schema.safeParse(args);
        if (!parsed.success) return errorResult(z.prettifyError(parsed.error));
        try {
          return textResult(await request(parsed.data));
        } catch (error) {
          return errorResult(
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    );
  };
}
