import { z } from "zod";
import { errorResult, textResult } from "../utils/mcp-result.js";
import type { ToolClient, ToolRegistrar } from "./register.js";

const id = z.string().trim().min(1);
const title = id.max(255);
const description = z.string().max(10_000).nullable().optional();
const milestoneDate = z.iso.date().nullable().optional();
const planning = {
  leadId: id.nullable().optional(),
  status: id.optional(),
  priority: z
    .enum(["no-priority", "low", "medium", "high", "urgent"])
    .optional(),
  releaseId: id.nullable().optional(),
};
const validDateOrder = (args: {
  startDate?: string | null;
  endDate?: string | null;
}) => !args.startDate || !args.endDate || args.startDate <= args.endDate;

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
    "List a Feature's ordered milestones with unfiltered total, started and completed task/bug counts.",
    z.object({ featureId: id }),
    ({ featureId }) => client.json(featurePath(featureId), { method: "GET" }),
  );
  register(
    "get_milestone",
    "Get a milestone's metadata and current progress.",
    z.object({ milestoneId: id }),
    ({ milestoneId }) => client.json(itemPath(milestoneId), { method: "GET" }),
  );
  register(
    "create_milestone",
    "Append a milestone to a Feature. Milestones belong only to Features; optional startDate and endDate are calendar days and do not change task deadlines. When both are set, startDate must be on or before endDate. Optional taskIds atomically links existing Tasks/Bugs already in this Feature, reassigning any prior milestone; invalid selections create nothing.",
    z
      .object({
        featureId: id,
        title,
        description,
        startDate: milestoneDate,
        endDate: milestoneDate,
        ...planning,
        taskIds: z
          .array(id)
          .refine(
            (ids) => new Set(ids).size === ids.length,
            "Task IDs must be unique",
          )
          .optional(),
      })
      .refine(validDateOrder, {
        message: "Start date must be on or before end date",
        path: ["endDate"],
      }),
    ({ featureId, ...body }) =>
      client.json(featurePath(featureId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
  );
  register(
    "update_milestone",
    "Edit milestone metadata. Null clears the description or either date. Omitted fields stay unchanged; the resulting range must remain valid.",
    z
      .object({
        milestoneId: id,
        title: title.optional(),
        description,
        startDate: milestoneDate,
        endDate: milestoneDate,
        ...planning,
      })
      .refine(
        (args) =>
          args.title !== undefined ||
          args.description !== undefined ||
          args.startDate !== undefined ||
          args.endDate !== undefined ||
          args.leadId !== undefined ||
          args.status !== undefined ||
          args.priority !== undefined ||
          args.releaseId !== undefined,
        "Provide a field to update",
      )
      .refine(validDateOrder, {
        message: "Start date must be on or before end date",
        path: ["endDate"],
      }),
    ({ milestoneId, ...body }) =>
      client.json(itemPath(milestoneId), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  );
  register(
    "list_project_milestones",
    "List a bounded page of a project's milestones, with planning fields, owning Feature metadata and task/bug progress.",
    z.object({
      projectId: id,
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    ({ projectId, page, limit }) => {
      const query = new URLSearchParams();
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
      milestoneIds: z
        .array(id)
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "Milestone IDs must be unique",
        ),
    }),
    ({ featureId, milestoneIds }) =>
      client.json(`${featurePath(featureId)}/order`, {
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
