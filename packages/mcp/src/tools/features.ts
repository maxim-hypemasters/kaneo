import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

export function registerFeatureTools(
  server: ToolRegistrar,
  client: ToolClient,
) {
  const id = z.string().trim().min(1);
  registerTool(
    server,
    "list_features",
    {
      description:
        "Browse a bounded page of active or archived Feature knowledge records. Features have documentation, labels and milestones, without execution planning fields.",
      inputSchema: z.object({
        projectId: id,
        archived: z.boolean().optional(),
        search: z.string().trim().max(255).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, ...options }) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(options))
        if (value !== undefined) query.set(key, String(value));
      return client.json(
        `/api/task/feature-library/${encodeURIComponent(projectId)}${query.size ? `?${query}` : ""}`,
        { method: "GET" },
      );
    },
  );
  registerTool(
    server,
    "archive_feature",
    {
      description:
        "Archive or restore a Feature knowledge record. Milestones and linked work retain their planning state.",
      inputSchema: z.object({ featureId: id, archived: z.boolean() }),
      annotations: { readOnlyHint: false },
    },
    ({ featureId, archived }) =>
      client.json(
        `/api/task/${encodeURIComponent(featureId)}/feature-archive`,
        {
          method: "PUT",
          body: JSON.stringify({ archived }),
        },
      ),
  );
}
