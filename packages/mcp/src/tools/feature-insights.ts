import { z } from "zod";
import type { ToolAnnotations, ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

const id = z.string().trim().min(1);
const page = z.number().int().min(1).max(1_000_000).optional();
const limit = z.number().int().min(1).max(100).optional();
const read = { readOnlyHint: true } satisfies ToolAnnotations;
const write = { readOnlyHint: false } satisfies ToolAnnotations;

function withQuery(path: string, options: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options))
    if (value !== undefined) query.set(key, String(value));
  return `${path}${query.size ? `?${query}` : ""}`;
}

export function registerFeatureInsightTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  const featurePath = (featureId: string) =>
    `/api/feature/${encodeURIComponent(featureId)}`;

  registerTool(
    server,
    "get_latest_feature_update",
    {
      description:
        "Get a Feature's latest published update: health, markdown note and the milestone progress snapshot. Returns null when none was published.",
      inputSchema: z.object({ featureId: id }),
      annotations: read,
    },
    ({ featureId }) =>
      client.json(`${featurePath(featureId)}/updates/latest`, {
        method: "GET",
      }),
  );
  registerTool(
    server,
    "post_feature_update",
    {
      description:
        "Publish an official Feature update with a health and a markdown note. The server snapshots milestone progress.",
      inputSchema: z.strictObject({
        featureId: id,
        health: z.enum(["on-track", "at-risk", "off-track"]),
        note: z.string().trim().min(1).max(100_000),
      }),
      annotations: write,
    },
    ({ featureId, health, note }) =>
      client.json(`${featurePath(featureId)}/updates`, {
        method: "POST",
        body: JSON.stringify({ note, health }),
      }),
  );
  registerTool(
    server,
    "list_feature_issues",
    {
      description:
        "List a bounded page of a Feature's Tasks and Bugs in workflow order (50 by default, maximum 100), without descriptions, with per-column totals for all matching work. milestoneId 'none' selects work without a milestone; archived defaults to exclude.",
      inputSchema: z.object({
        featureId: id,
        search: z.string().trim().max(255).optional(),
        milestoneId: id.optional(),
        archived: z.enum(["exclude", "include", "only"]).optional(),
        page,
        limit,
      }),
      annotations: read,
    },
    ({ featureId, ...options }) =>
      client.json(withQuery(`${featurePath(featureId)}/issues`, options), {
        method: "GET",
      }),
  );
  registerTool(
    server,
    "list_feature_activity",
    {
      description:
        "List a bounded page of a Feature's activity, newest first: comments, official updates and system history (50 by default, maximum 100).",
      inputSchema: z.object({ featureId: id, page, limit }),
      annotations: read,
    },
    ({ featureId, ...options }) =>
      client.json(withQuery(`${featurePath(featureId)}/activity`, options), {
        method: "GET",
      }),
  );
}
