import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

const projectId = z
  .string()
  .trim()
  .min(1)
  .describe("Project ID, from list_projects.");

export function registerProjectLinkTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  registerTool(
    server,
    "list_project_links",
    {
      description:
        "List the links in a project's Resources (id, title, url, position), in the order people arranged them: specs, design files, staging sites and the like. Anyone with access to the project can read them.",
      inputSchema: z.object({ projectId }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId }) =>
      client.json(
        `/api/project-link/project/${encodeURIComponent(projectId)}`,
        { method: "GET" },
      ),
  );
}
