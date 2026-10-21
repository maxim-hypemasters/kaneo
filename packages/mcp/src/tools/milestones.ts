import { z } from "zod";
import { errorResult, textResult } from "../utils/mcp-result.js";
import type { ToolClient, ToolRegistrar } from "./register.js";

const id = z.string().trim().min(1);
const title = id.max(255);
const description = z.string().max(10_000).nullable().optional();
const timeZone = z.string().trim().min(1).max(100).optional();
const planning = {
  leadId: id.nullable().optional(),
  priority: z
    .enum(["no-priority", "low", "medium", "high", "urgent"])
    .optional(),
  releaseId: id.nullable().optional(),
};
function metadataPath(path: string, zone?: string) {
  const query = new URLSearchParams();
  if (zone !== undefined) query.set("timeZone", zone);
  return `${path}${query.size ? `?${query}` : ""}`;
}

export function registerMilestoneTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  function register<S extends z.ZodObject>(
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
  }
  const featurePath = (featureId: string) =>
    `/api/milestone/feature/${encodeURIComponent(featureId)}`;
  const itemPath = (milestoneId: string) =>
    `/api/milestone/${encodeURIComponent(milestoneId)}`;

  register(
    "list_milestones",
    "List a Feature's ordered milestones with unfiltered task/bug progress and read-only status and dates derived from nonarchived work. Returned dates use timeZone, defaulting to UTC.",
    z.object({ featureId: id, timeZone }),
    ({ featureId, timeZone }) =>
      client.json(metadataPath(featurePath(featureId), timeZone), {
        method: "GET",
      }),
  );
  register(
    "get_milestone",
    "Get a milestone's metadata, progress, and read-only status and dates derived from nonarchived work. Returned dates use timeZone, defaulting to UTC.",
    z.object({ milestoneId: id, timeZone }),
    ({ milestoneId, timeZone }) =>
      client.json(metadataPath(itemPath(milestoneId), timeZone), {
        method: "GET",
      }),
  );
  register(
    "create_milestone",
    "Append a milestone to a Feature. Status and dates are read-only and derived from nonarchived linked Tasks/Bugs. All eligible work Done means Done; any active or completed work means In Progress; otherwise To Do. Optional taskIds atomically links existing Tasks/Bugs already in this Feature, reassigning any prior milestone; invalid selections create nothing. Returned dates use timeZone, defaulting to UTC.",
    z.strictObject({
      featureId: id,
      timeZone,
      title,
      description,
      ...planning,
      taskIds: z
        .array(id)
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "Task IDs must be unique",
        )
        .optional(),
    }),
    ({ featureId, timeZone, ...body }) =>
      client.json(metadataPath(featurePath(featureId), timeZone), {
        method: "POST",
        body: JSON.stringify(body),
      }),
  );
  register(
    "update_milestone",
    "Edit milestone metadata. Status and dates are read-only and derived from nonarchived linked Tasks/Bugs. All eligible work Done means Done; any active or completed work means In Progress; otherwise To Do. Null clears optional metadata; omitted fields stay unchanged. Returned dates use timeZone, defaulting to UTC.",
    z
      .strictObject({
        milestoneId: id,
        timeZone,
        title: title.optional(),
        description,
        ...planning,
      })
      .refine(
        (args) =>
          args.title !== undefined ||
          args.description !== undefined ||
          args.leadId !== undefined ||
          args.priority !== undefined ||
          args.releaseId !== undefined,
        "Provide a field to update",
      ),
    ({ milestoneId, timeZone, ...body }) =>
      client.json(metadataPath(itemPath(milestoneId), timeZone), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  );
  register(
    "list_project_milestones",
    "List a bounded page of a project's milestones, with planning fields, owning Feature metadata and task/bug progress.",
    z.object({
      projectId: id,
      timeZone,
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    ({ projectId, timeZone, page, limit }) => {
      const query = new URLSearchParams();
      if (timeZone !== undefined) query.set("timeZone", timeZone);
      if (page !== undefined) query.set("page", String(page));
      if (limit !== undefined) query.set("limit", String(limit));
      return client.json(
        `/api/milestone/project/${encodeURIComponent(projectId)}${query.size ? `?${query}` : ""}`,
        { method: "GET" },
      );
    },
  );
  register(
    "delete_milestone",
    "Delete a milestone. Linked Tasks and Bugs remain in their Feature and Release without a milestone.",
    z.object({ milestoneId: id }),
    ({ milestoneId }) =>
      client.json(itemPath(milestoneId), { method: "DELETE" }),
  );
  register(
    "reorder_milestones",
    "Set the complete order of a Feature's milestone IDs. Duplicate or stale lists are rejected.",
    z.object({
      featureId: id,
      timeZone,
      milestoneIds: z
        .array(id)
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "Milestone IDs must be unique",
        ),
    }),
    ({ featureId, timeZone, milestoneIds }) =>
      client.json(metadataPath(`${featurePath(featureId)}/order`, timeZone), {
        method: "PUT",
        body: JSON.stringify({ milestoneIds }),
      }),
  );
  register(
    "set_task_milestone",
    "Assign a Task or Bug to a milestone of its existing Feature, or null to clear. This does not move the task to another Feature.",
    z.object({ taskId: id, milestoneId: id.nullable() }),
    ({ taskId, milestoneId }) =>
      client.json(`/api/task/${encodeURIComponent(taskId)}/milestone`, {
        method: "PATCH",
        body: JSON.stringify({ milestoneId }),
      }),
  );
}
