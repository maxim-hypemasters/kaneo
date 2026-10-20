import { z } from "zod";
import { errorResult, textResult } from "../utils/mcp-result.js";
import type { ToolClient, ToolRegistrar } from "./register.js";

export function registerFeatureTools(
  server: ToolRegistrar,
  client: ToolClient,
) {
  const id = z.string().trim().min(1);
  const list = z.object({
    projectId: id,
    archived: z.boolean().optional(),
    search: z.string().trim().max(255).optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  });
  server.registerTool(
    "list_features",
    {
      description:
        "Browse a bounded page of active or archived Feature knowledge records. Features have documentation, labels and milestones, without execution planning fields.",
      inputSchema: list,
    },
    async (args) => {
      const parsed = list.safeParse(args);
      if (!parsed.success) return errorResult(z.prettifyError(parsed.error));
      const { projectId, ...options } = parsed.data;
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(options))
        if (value !== undefined) query.set(key, String(value));
      try {
        return textResult(
          await client.json(
            `/api/task/feature-library/${encodeURIComponent(projectId)}${query.size ? `?${query}` : ""}`,
            { method: "GET" },
          ),
        );
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );
  const archive = z.object({ featureId: id, archived: z.boolean() });
  server.registerTool(
    "archive_feature",
    {
      description:
        "Archive or restore a Feature knowledge record. Milestones and linked work retain their planning state.",
      inputSchema: archive,
    },
    async (args) => {
      const parsed = archive.safeParse(args);
      if (!parsed.success) return errorResult(z.prettifyError(parsed.error));
      try {
        return textResult(
          await client.json(
            `/api/task/${encodeURIComponent(parsed.data.featureId)}/feature-archive`,
            {
              method: "PUT",
              body: JSON.stringify({ archived: parsed.data.archived }),
            },
          ),
        );
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );
}
