import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

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
// Mirrors milestoneTaskDraftSchema in apps/api/src/milestone/schema.ts; type
// stays optional so the API applies its task default.
export const milestoneTaskDraftSchema = z
  .object({
    title: z.string().trim().min(1),
    type: z.enum(["task", "bug"]).optional().describe("Defaults to task"),
    estimateSeconds: z
      .number()
      .int()
      .positive()
      .max(2_147_483_640)
      .multipleOf(60)
      .nullable()
      .optional()
      .describe("Effort in seconds, in whole minutes"),
  })
  .strict();
function metadataPath(path: string, zone?: string) {
  const query = new URLSearchParams();
  if (zone !== undefined) query.set("timeZone", zone);
  return `${path}${query.size ? `?${query}` : ""}`;
}

export function registerMilestoneTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  const featurePath = (featureId: string) =>
    `/api/milestone/feature/${encodeURIComponent(featureId)}`;
  const itemPath = (milestoneId: string) =>
    `/api/milestone/${encodeURIComponent(milestoneId)}`;

  registerTool(
    server,
    "list_milestones",
    {
      description:
        "List a Feature's ordered milestones with unfiltered task/bug progress and read-only status and dates derived from nonarchived work. Returned dates use timeZone, defaulting to UTC.",
      inputSchema: z.object({ featureId: id, timeZone }),
      annotations: { readOnlyHint: true },
    },
    ({ featureId, timeZone }) =>
      client.json(metadataPath(featurePath(featureId), timeZone), {
        method: "GET",
      }),
  );
  registerTool(
    server,
    "get_milestone",
    {
      description:
        "Get a milestone's metadata, progress, and read-only status and dates derived from nonarchived work. Returned dates use timeZone, defaulting to UTC.",
      inputSchema: z.object({ milestoneId: id, timeZone }),
      annotations: { readOnlyHint: true },
    },
    ({ milestoneId, timeZone }) =>
      client.json(metadataPath(itemPath(milestoneId), timeZone), {
        method: "GET",
      }),
  );
  registerTool(
    server,
    "create_milestone",
    {
      description:
        "Append a milestone to a Feature. Status and dates are read-only and derived from nonarchived linked Tasks/Bugs. All eligible work Done means Done; any active or completed work means In Progress; otherwise To Do. Optional taskIds links existing Tasks/Bugs already in this Feature, reassigning any prior milestone, and newTasks creates title-only Tasks/Bugs in the milestone and its release; all of it is saved or nothing is. Returned dates use timeZone, defaulting to UTC.",
      inputSchema: z.strictObject({
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
        newTasks: z.array(milestoneTaskDraftSchema).max(100).optional(),
      }),
      annotations: { readOnlyHint: false },
    },
    ({ featureId, timeZone, ...body }) =>
      client.json(metadataPath(featurePath(featureId), timeZone), {
        method: "POST",
        body: JSON.stringify(body),
      }),
  );
  registerTool(
    server,
    "update_milestone",
    {
      description:
        "Edit milestone metadata. Status and dates are read-only and derived from nonarchived linked Tasks/Bugs. All eligible work Done means Done; any active or completed work means In Progress; otherwise To Do. Null clears optional metadata; omitted fields stay unchanged. Returned dates use timeZone, defaulting to UTC.",
      inputSchema: z
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
      annotations: { readOnlyHint: false },
    },
    ({ milestoneId, timeZone, ...body }) =>
      client.json(metadataPath(itemPath(milestoneId), timeZone), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  );
  registerTool(
    server,
    "list_project_milestones",
    {
      description:
        "List a bounded page of a project's milestones, with planning fields, owning Feature metadata and task/bug progress.",
      inputSchema: z.object({
        projectId: id,
        timeZone,
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
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
  registerTool(
    server,
    "delete_milestone",
    {
      description:
        "Delete a milestone. Linked Tasks and Bugs remain in their Feature and Release without a milestone.",
      inputSchema: z.object({ milestoneId: id }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    ({ milestoneId }) =>
      client.json(itemPath(milestoneId), { method: "DELETE" }),
  );
  registerTool(
    server,
    "reorder_milestones",
    {
      description:
        "Set the complete order of a Feature's milestone IDs. Duplicate or stale lists are rejected.",
      inputSchema: z.object({
        featureId: id,
        timeZone,
        milestoneIds: z
          .array(id)
          .refine(
            (ids) => new Set(ids).size === ids.length,
            "Milestone IDs must be unique",
          ),
      }),
      annotations: { readOnlyHint: false },
    },
    ({ featureId, timeZone, milestoneIds }) =>
      client.json(metadataPath(`${featurePath(featureId)}/order`, timeZone), {
        method: "PUT",
        body: JSON.stringify({ milestoneIds }),
      }),
  );
  registerTool(
    server,
    "set_task_milestone",
    {
      description:
        "Assign a Task or Bug to a milestone of its existing Feature, or null to clear. This does not move the task to another Feature.",
      inputSchema: z.object({ taskId: id, milestoneId: id.nullable() }),
      annotations: { readOnlyHint: false },
    },
    ({ taskId, milestoneId }) =>
      client.json(`/api/task/${encodeURIComponent(taskId)}/milestone`, {
        method: "PATCH",
        body: JSON.stringify({ milestoneId }),
      }),
  );
}
