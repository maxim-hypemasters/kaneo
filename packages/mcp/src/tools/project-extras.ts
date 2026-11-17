import { z } from "zod";
import type { ToolAnnotations, ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

const id = z.string().trim().min(1);
const read = { readOnlyHint: true } satisfies ToolAnnotations;
const write = { readOnlyHint: false } satisfies ToolAnnotations;

export function registerProjectExtraTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  registerTool(
    server,
    "update_project_details",
    {
      description:
        "Change a project's name, description, or both. Needs only project:edit_details; other project settings stay as they are.",
      inputSchema: z
        .strictObject({
          projectId: id,
          name: id.max(255).optional(),
          description: z.string().max(10_000).optional(),
        })
        .refine(
          ({ name, description }) =>
            name !== undefined || description !== undefined,
          "Provide name, description, or both",
        ),
      annotations: write,
    },
    ({ projectId, ...details }) =>
      client.json(`/api/project/${encodeURIComponent(projectId)}/details`, {
        method: "PATCH",
        body: JSON.stringify(details),
      }),
  );
  registerTool(
    server,
    "list_custom_fields",
    {
      description:
        "List a project's custom field definitions: id, name, type, required, default and options. Use the ids with set_task_custom_field_value.",
      inputSchema: z.object({ projectId: id }),
      annotations: read,
    },
    ({ projectId }) =>
      client.json(
        `/api/custom-field/project/${encodeURIComponent(projectId)}`,
        {
          method: "GET",
        },
      ),
  );
  registerTool(
    server,
    "list_release_milestones",
    {
      description:
        "List the Feature milestones in a release, in order: milestones assigned to it and those of its Tasks/Bugs, including empty ones. Returned dates use timeZone (IANA), defaulting to UTC.",
      inputSchema: z.object({
        releaseId: id,
        timeZone: z.string().trim().min(1).max(100).optional(),
      }),
      annotations: read,
    },
    ({ releaseId, timeZone }) => {
      const query = new URLSearchParams();
      if (timeZone !== undefined) query.set("timeZone", timeZone);
      return client.json(
        `/api/release/${encodeURIComponent(releaseId)}/milestones${query.size ? `?${query}` : ""}`,
        { method: "GET" },
      );
    },
  );
}
