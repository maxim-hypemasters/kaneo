import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

const workspaceId = z
  .string()
  .trim()
  .min(1)
  .describe("Workspace ID, from list_workspaces.");

export function registerTeamTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  registerTool(
    server,
    "list_teams",
    {
      description:
        "List a workspace's teams by name, each with its members and linked projects. Members of a team can open its linked projects even when their own project access is limited to selected projects. Linked projects you can't access are left out. Any workspace member can read teams.",
      inputSchema: z.object({ workspaceId }),
      annotations: { readOnlyHint: true },
    },
    ({ workspaceId }) =>
      client.json(`/api/team/workspace/${encodeURIComponent(workspaceId)}`, {
        method: "GET",
      }),
  );
}
