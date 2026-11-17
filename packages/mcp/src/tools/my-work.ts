import { z } from "zod";
import type { ToolAnnotations, ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

const workspaceId = z.string().trim().min(1);
const read = { readOnlyHint: true } satisfies ToolAnnotations;

export function registerMyWorkTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  registerTool(
    server,
    "list_my_tasks",
    {
      description:
        "List the open tasks assigned to you across a workspace's active projects, ordered by due date (undated last) then priority. Completed and archived work is excluded. Returns at most 100; total counts all. countOnly returns just the total.",
      inputSchema: z.object({ workspaceId, countOnly: z.boolean().optional() }),
      annotations: read,
    },
    ({ workspaceId, countOnly }) => {
      const query = new URLSearchParams({ workspaceId });
      if (countOnly !== undefined) query.set("countOnly", String(countOnly));
      return client.json(`/api/task/assigned?${query}`, { method: "GET" });
    },
  );
  registerTool(
    server,
    "list_workspace_activity",
    {
      description:
        "List the 20 most recent task events across a workspace's active projects from the last 30 days, newest first, each with a short plain-text excerpt.",
      inputSchema: z.object({ workspaceId }),
      annotations: read,
    },
    ({ workspaceId }) =>
      client.json(
        `/api/activity/workspace/${encodeURIComponent(workspaceId)}`,
        {
          method: "GET",
        },
      ),
  );
}
