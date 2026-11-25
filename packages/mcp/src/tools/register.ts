import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { buildFullTaskUpdateBody } from "../kaneo/task-helpers.js";
import { errorResult, textResult } from "../utils/mcp-result.js";
import { featureCompositionSchema } from "./feature-composition-schema.js";
import { registerFeatureDocumentTools } from "./feature-documents.js";
import { registerFeatureInsightTools } from "./feature-insights.js";
import { registerFeatureTools } from "./features.js";
import { getCurrentUser } from "./get-current-user.js";
import { registerMilestoneTools } from "./milestones.js";
import { registerMyWorkTools } from "./my-work.js";
import { registerProjectExtraTools } from "./project-extras.js";
import { registerProjectLinkTools } from "./project-links.js";
import { registerProjectPageTools } from "./project-pages.js";
import { registerTaskExtraTools } from "./task-extras.js";
import { registerTeamTools } from "./teams.js";
import { registerTimeOffTools } from "./time-off.js";
import { registerTimeOffHolidayRequestTools } from "./time-off-holiday-requests.js";
import { registerTimeOffHolidayTools } from "./time-off-holidays.js";
import { registerTriageTools } from "./triage.js";

// Shared with the API's assistant, so its append previews match the write.
export { appendMarkdown } from "./append-to-document.js";

export type ToolClient = {
  readonly usingApiKey?: boolean;
  json<T = unknown>(path: string, init?: RequestInit): Promise<T>;
};
export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
};
export type ToolRegistrar = {
  registerTool(
    name: string,
    config: {
      description: string;
      inputSchema: z.ZodObject;
      annotations?: ToolAnnotations;
    },
    callback: (args: unknown) => Promise<CallToolResult>,
  ): unknown;
};

const prioritySchema = z.enum([
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
]);

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const nullableOptionalNonEmptyString = nonEmptyString.nullable().optional();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const optionalIsoDateTimeSchema = isoDateTimeSchema.optional();
// The API checks hand-set dates against the assignee's days away in this zone.
const dayTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .optional()
  .describe(
    "IANA time zone whose calendar days the dates name, such as Europe/Berlin. Kaneo checks those days against the assignee's days away. Defaults to the project's planning time zone, then UTC.",
  );
const estimateSecondsSchema = z
  .number()
  .int()
  .positive()
  .max(2_147_483_640)
  .multipleOf(60)
  .nullable()
  .describe(
    "Total effort in seconds, in whole minutes. Dates come from Preview/Apply planning.",
  );
// Feature identity uses the task resource, without execution planning.
const taskTypeSchema = z.enum(["task", "bug", "feature"]);
// Release dates are calendar days with no time zone.
const releaseDaySchema = z.iso.date();
const optionalReleaseDaySchema = releaseDaySchema.optional();
const releaseDescriptionSchema = z.string().max(10_000);
const releaseNameSchema = nonEmptyString.max(100);
const RELEASE_PHASES =
  "The phase isn't stored: compare today with the dates. Upcoming before startDate; in progress from startDate until the day before codeFreezeDate; code freeze from codeFreezeDate through submissionDate; past submission after submissionDate.";
const hexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Expected a hex color like #FF6600",
  );
// Mirrors createTaskBody.customFields in apps/api/src/task/schema.ts.
const customFieldsSchema = z
  .array(z.object({ fieldId: z.string().min(1), value: z.string() }))
  .describe(
    "Custom field values (see list_custom_fields). value is a string: a number, 'true'/'false', YYYY-MM-DD, a dropdown option, or a JSON array of multiselect options.",
  );

function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  return fn()
    .then((data) => textResult(data))
    .catch((e: unknown) =>
      errorResult(e instanceof Error ? e.message : String(e)),
    );
}

export function registerTools(
  server: ToolRegistrar,
  ctx: { client: ToolClient },
): void {
  const { client } = ctx;
  registerMilestoneTools(server, client);
  registerFeatureTools(server, client);
  registerTriageTools(server, client);
  registerProjectPageTools(server, client);
  registerFeatureDocumentTools(server, client);
  registerFeatureInsightTools(server, client);
  registerMyWorkTools(server, client);
  registerTaskExtraTools(server, client);
  registerProjectExtraTools(server, client);
  registerTimeOffTools(server, client);
  registerTimeOffHolidayTools(server, client);
  registerTimeOffHolidayRequestTools(server, client);
  registerTeamTools(server, client);
  registerProjectLinkTools(server, client);
  const registerTool = <S extends z.ZodObject>(
    name: string,
    config: {
      description: string;
      inputSchema: S;
      annotations: ToolAnnotations & { readOnlyHint: boolean };
    },
    callback: (args: z.output<S>) => Promise<CallToolResult>,
  ) =>
    server.registerTool(name, config, async (args) => {
      const parsed = config.inputSchema.safeParse(args);
      if (!parsed.success) return errorResult(z.prettifyError(parsed.error));
      return callback(parsed.data);
    });

  registerTool(
    "whoami",
    {
      description:
        "Return the current Kaneo user for the configured authentication method.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => run(() => getCurrentUser(client)),
  );

  registerTool(
    "list_workspaces",
    {
      description:
        "List workspaces (Better Auth organizations) the signed-in user can access.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      run(() => client.json("/api/auth/organization/list", { method: "GET" })),
  );

  registerTool(
    "list_projects",
    {
      description: "List projects in a workspace.",
      inputSchema: z.object({
        workspaceId: nonEmptyString.describe("Workspace ID"),
        includeArchived: z
          .boolean()
          .optional()
          .describe("Include archived projects"),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const { workspaceId, includeArchived } = args;
      const qs = new URLSearchParams({ workspaceId });
      if (includeArchived === true) {
        qs.set("includeArchived", "true");
      }
      return run(() =>
        client.json(`/api/project?${qs.toString()}`, { method: "GET" }),
      );
    },
  );

  registerTool(
    "get_project",
    {
      description: "Get a single project by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() => client.json(`/api/project/${encodeURIComponent(args.id)}`)),
  );

  registerTool(
    "create_project",
    {
      description: "Create a project in a workspace.",
      inputSchema: z.object({
        name: nonEmptyString,
        workspaceId: nonEmptyString,
        icon: nonEmptyString,
        slug: nonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json("/api/project", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            workspaceId: args.workspaceId,
            icon: args.icon,
            slug: args.slug,
          }),
        }),
      ),
  );

  registerTool(
    "update_project",
    {
      description:
        "Update project metadata (PATCH-style: only provided fields are changed).",
      inputSchema: z.object({
        id: nonEmptyString,
        name: optionalNonEmptyString,
        icon: z.string().optional(),
        slug: optionalNonEmptyString,
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const { id, ...patch } = args;
      return run(async () => {
        const existing = (await client.json(
          `/api/project/${encodeURIComponent(id)}`,
          { method: "GET" },
        )) as Record<string, unknown>;
        const name =
          patch.name ??
          (typeof existing.name === "string" ? existing.name : "");
        if (!name) {
          throw new Error("Cannot update project: missing name.");
        }
        const icon =
          patch.icon !== undefined
            ? patch.icon
            : typeof existing.icon === "string"
              ? existing.icon
              : "Layout";
        const slug =
          patch.slug ??
          (typeof existing.slug === "string" ? existing.slug : "");
        if (!slug) {
          throw new Error("Cannot update project: missing slug.");
        }
        const description =
          patch.description !== undefined
            ? patch.description
            : typeof existing.description === "string"
              ? existing.description
              : "";
        const isPublic =
          patch.isPublic !== undefined
            ? patch.isPublic
            : typeof existing.isPublic === "boolean"
              ? existing.isPublic
              : false;

        const body = { name, icon, slug, description, isPublic };

        return client.json(`/api/project/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      });
    },
  );

  const listTasksSchema = z.object({
    projectId: nonEmptyString,
    type: z
      .enum(["task", "bug"])
      .optional()
      .describe("Only this execution item type; task excludes bugs"),
    status: optionalNonEmptyString,
    priority: prioritySchema.optional(),
    assigneeId: optionalNonEmptyString,
    page: z.number().int().min(1).max(1_000_000).optional(),
    relatedPage: z.number().int().min(1).max(1_000_000).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    sortBy: z
      .enum(["createdAt", "priority", "dueDate", "position", "title", "number"])
      .optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    dueBefore: optionalIsoDateTimeSchema,
    dueAfter: optionalIsoDateTimeSchema,
    featureId: optionalNonEmptyString.describe(
      "Only work in this Feature, or none for no Feature",
    ),
    milestoneId: optionalNonEmptyString.describe(
      "Only work in this milestone, or none for no milestone",
    ),
    releaseId: optionalNonEmptyString.describe(
      "Only Tasks and Bugs in this release, or 'none' for those in no release",
    ),
  });

  registerTool(
    "list_tasks",
    {
      description:
        "List a bounded page of Tasks and Bugs for a project (50 by default, maximum 100); Features are available through list_features. Use pagination.totalPages and page to retrieve the rest; filters and sorting apply before pagination. For every task page, also follow relatedPage through pagination.relatedTotalPages for complete labels, links and column metadata. Each item has a type ('task' or 'bug'), a featureId (the feature it belongs to, or null), a releaseId (its release, or null), and milestoneId (its milestone, or null). New work waiting for review has status 'triage' and comes back in data.triageTasks, never in columns or plannedTasks; filter it with status 'triage'. Only accept_triage_task and decline_triage_task move work out of Triage.",
      inputSchema: listTasksSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const { projectId, ...rest } = args;
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(rest)) {
        if (v === undefined || v === null) {
          continue;
        }
        qs.set(k, String(v));
      }
      const q = qs.toString();
      const path = `/api/task/tasks/${encodeURIComponent(projectId)}${q ? `?${q}` : ""}`;
      return run(() => client.json(path, { method: "GET" }));
    },
  );

  registerTool(
    "get_task",
    {
      description:
        "Get a task by ID, including its type ('task', 'bug' or 'feature'), featureId (the feature it belongs to, or null), releaseId (its release, or null), and milestoneId (its milestone, or null).",
      inputSchema: z.object({ taskId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "get_task_by_ticket_id",
    {
      description:
        "Get one task by its ticket ID (project key and number, e.g. KAN-12). If multiple accessible tasks share the ID, provide workspaceId or projectId.",
      inputSchema: z.object({
        ticketId: nonEmptyString,
        workspaceId: optionalNonEmptyString,
        projectId: optionalNonEmptyString,
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticketId, workspaceId, projectId }) => {
      const query = new URLSearchParams();
      if (workspaceId) query.set("workspaceId", workspaceId);
      if (projectId) query.set("projectId", projectId);
      const suffix = query.toString();
      return run(() =>
        client.json(
          `/api/task/by-ticket-id/${encodeURIComponent(ticketId)}${suffix ? `?${suffix}` : ""}`,
          { method: "GET" },
        ),
      );
    },
  );

  registerTool(
    "create_task",
    {
      description:
        "Create a task, bug or feature in a project. Pass type 'bug' for a bug, 'feature' for a feature, or featureId to create a task or bug inside a feature of the same project. A feature can't belong to another feature. Features are knowledge records without planning fields. Tasks/Bugs inherit their milestone's release when releaseId is omitted. A new Feature can bring its milestones, existing work and new Tasks/Bugs in featureComposition; all of it is saved or nothing is. When the project has triage members and you are not one, a new Task or Bug starts in the 'triage' status whatever status you pass.",
      inputSchema: z
        .object({
          projectId: nonEmptyString,
          title: nonEmptyString,
          description: z.string(),
          priority: prioritySchema.optional(),
          status: optionalNonEmptyString,
          estimateSeconds: estimateSecondsSchema.optional(),
          userId: optionalNonEmptyString,
          type: taskTypeSchema
            .optional()
            .describe(
              "'bug' behaves like a task; 'feature' groups tasks and bugs. Defaults to 'task'.",
            ),
          featureId: optionalNonEmptyString.describe(
            "Create the Task or Bug inside this knowledge Feature of the same project.",
          ),
          milestoneId: nullableOptionalNonEmptyString.describe(
            "A milestone of the same Feature, or null for none. Requires featureId and does not move Feature membership.",
          ),
          releaseId: nullableOptionalNonEmptyString.describe(
            "A release of the same project (see list_releases), or null for none. Omit it to follow the milestone's release.",
          ),
          customFields: customFieldsSchema.optional(),
          featureComposition: featureCompositionSchema.optional(),
        })
        .strict()
        .refine(
          (args) =>
            args.featureComposition === undefined || args.type === "feature",
          {
            message: "Creation drafts are only supported for Features",
            path: ["featureComposition"],
          },
        )
        .refine(
          (args) =>
            args.type !== "feature" ||
            [
              args.priority,
              args.status,
              args.estimateSeconds,
              args.userId,
              args.featureId,
              args.milestoneId,
              args.releaseId,
            ].every((field) => field === undefined),
          {
            message:
              "Features are knowledge records without planning or parent membership fields.",
          },
        ),
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        title: args.title,
        description: args.description,
        priority: args.priority,
        status: args.status,
      };
      if (args.estimateSeconds !== undefined) {
        body.estimateSeconds = args.estimateSeconds;
      }
      if (args.userId !== undefined) {
        body.userId = args.userId;
      }
      if (args.type !== undefined) {
        body.type = args.type;
      }
      if (args.featureId !== undefined) {
        body.featureId = args.featureId;
      }
      if (args.milestoneId !== undefined) {
        body.milestoneId = args.milestoneId;
      }
      if (args.releaseId !== undefined) {
        body.releaseId = args.releaseId;
      }
      if (args.customFields !== undefined) {
        body.customFields = args.customFields;
      }
      if (args.featureComposition !== undefined) {
        body.featureComposition = args.featureComposition;
      }
      return run(() =>
        client.json(`/api/task/${encodeURIComponent(args.projectId)}`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },
  );

  registerTool(
    "duplicate_task",
    {
      description:
        "Duplicate a task in the same project, copying its fields, labels, type, feature and release. A feature's tasks are not copied. Pass title to rename the copy.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        title: optionalNonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const body: Record<string, string> = {};
      if (args.title !== undefined) {
        body.title = args.title;
      }
      return run(() =>
        client.json(`/api/task/duplicate/${encodeURIComponent(args.taskId)}`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },
  );

  const updateTaskSchema = z
    .object({
      taskId: nonEmptyString,
      title: optionalNonEmptyString,
      description: z.string().nullable().optional(),
      status: optionalNonEmptyString,
      priority: prioritySchema.optional(),
      projectId: optionalNonEmptyString,
      position: z.number().optional(),
      estimateSeconds: estimateSecondsSchema.optional(),
      userId: nullableOptionalNonEmptyString,
      timeZone: dayTimeZoneSchema,
    })
    .strict();

  registerTool(
    "update_task",
    {
      description:
        "Update a task (fetches current task, merges fields, then full update). Leaves the task's type, feature and release as they are: use set_task_type, set_task_feature and set_task_release for those. The status can't move into or out of 'triage': use accept_triage_task or decline_triage_task. Reassigning work whose dates were set by hand fails with TASK_ASSIGNEE_AWAY when the new assignee is away (approved time off or a public holiday) on its start or due day.",
      inputSchema: updateTaskSchema,
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const { taskId, timeZone, ...patch } = args;
      return run(async () => {
        const existing = (await client.json(
          `/api/task/${encodeURIComponent(taskId)}`,
          { method: "GET" },
        )) as Record<string, unknown>;
        const body = {
          ...buildFullTaskUpdateBody(existing, patch),
          ...(timeZone ? { timeZone } : {}),
        };
        return client.json(`/api/task/${encodeURIComponent(taskId)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      });
    },
  );

  registerTool(
    "move_task",
    {
      description:
        "Move a task to another project (and optional column status). The task leaves its feature and its release; a feature that still has tasks can't be moved, and neither can work waiting in Triage.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        destinationProjectId: nonEmptyString,
        destinationStatus: optionalNonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/move/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            destinationProjectId: args.destinationProjectId,
            ...(args.destinationStatus !== undefined
              ? { destinationStatus: args.destinationStatus }
              : {}),
          }),
        }),
      ),
  );

  registerTool(
    "update_task_status",
    {
      description:
        "Update only the status (column) of a task. The 'triage' status can't be set or left this way: use accept_triage_task or decline_triage_task for work waiting in Triage.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        status: nonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/status/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ status: args.status }),
        }),
      ),
  );

  registerTool(
    "set_task_feature",
    {
      description:
        "Put a task into a feature of its project, or pass a null featureId to take it out of its feature. A task belongs to at most one feature, and a feature can't belong to one. Changing Feature clears milestone membership and preserves the task's release.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        featureId: nonEmptyString
          .nullable()
          .describe(
            "A task of type 'feature' in the same project, or null to remove the task from its feature",
          ),
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/feature/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ featureId: args.featureId }),
        }),
      ),
  );

  registerTool(
    "set_task_type",
    {
      description:
        "Convert between Task and Bug, preserving identity, Feature and milestone. Features cannot be converted.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        type: z
          .enum(["task", "bug"])
          .describe(
            "Task and Bug may be converted into each other; Features cannot be converted.",
          ),
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/type/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ type: args.type }),
        }),
      ),
  );

  registerTool(
    "list_releases",
    {
      description: `List a project's releases, ordered by start date, with their progress: Tasks/Bugs and milestones (total and completed, meaning in a final column), knowledge Feature groups, and unfinished work (neither archived nor completed). Dates are YYYY-MM-DD calendar days ordered startDate ≤ codeFreezeDate ≤ submissionDate. ${RELEASE_PHASES}`,
      inputSchema: z.object({ projectId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/release/project/${encodeURIComponent(args.projectId)}`,
          { method: "GET" },
        ),
      ),
  );

  registerTool(
    "get_release",
    {
      description: `Get a release by ID, with its progress. ${RELEASE_PHASES}`,
      inputSchema: z.object({ releaseId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/release/${encodeURIComponent(args.releaseId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "create_release",
    {
      description:
        "Create a release in a project: a planned delivery that holds milestones, Tasks and Bugs. The name must be unique in the project, and the dates must run startDate ≤ codeFreezeDate ≤ submissionDate (equal days are allowed). Needs permission to update the project (owners and admins by default).",
      inputSchema: z.object({
        projectId: nonEmptyString,
        name: releaseNameSchema,
        startDate: releaseDaySchema.describe("The first day of work"),
        codeFreezeDate: releaseDaySchema.describe("The day changes stop"),
        submissionDate: releaseDaySchema.describe("The day the release ships"),
        description: releaseDescriptionSchema.optional(),
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/release/project/${encodeURIComponent(args.projectId)}`,
          {
            method: "POST",
            body: JSON.stringify({
              name: args.name,
              startDate: args.startDate,
              codeFreezeDate: args.codeFreezeDate,
              submissionDate: args.submissionDate,
              ...(args.description !== undefined
                ? { description: args.description }
                : {}),
            }),
          },
        ),
      ),
  );

  registerTool(
    "update_release",
    {
      description:
        "Update a release (PATCH-style: only provided fields are changed). The date order is checked against the stored dates. Pass a null description to clear it. Its milestones and tasks stay in it. Needs permission to update the project.",
      inputSchema: z.object({
        releaseId: nonEmptyString,
        name: releaseNameSchema.optional(),
        startDate: optionalReleaseDaySchema,
        codeFreezeDate: optionalReleaseDaySchema,
        submissionDate: optionalReleaseDaySchema,
        description: releaseDescriptionSchema.nullable().optional(),
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const { releaseId, ...patch } = args;
      const body = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(body).length === 0) {
        return errorResult(
          "Nothing to update: pass name, startDate, codeFreezeDate, submissionDate or description.",
        );
      }
      return run(() =>
        client.json(`/api/release/${encodeURIComponent(releaseId)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      );
    },
  );

  registerTool(
    "delete_release",
    {
      description:
        "Delete a release. Its milestones and tasks stay in the project with no release, and each records the change in its activity. Needs permission to update the project and its tasks, bugs and milestones.",
      inputSchema: z.object({ releaseId: nonEmptyString }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/release/${encodeURIComponent(args.releaseId)}`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "set_task_release",
    {
      description:
        "Put a Task or Bug into a release of its project, or pass null to clear it. Features have no release. Milestone release changes move linked followers; explicit task overrides remain.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        releaseId: nonEmptyString
          .nullable()
          .describe(
            "A release in the task's project, or null to take the task out of its release",
          ),
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/release/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ releaseId: args.releaseId }),
        }),
      ),
  );

  registerTool(
    "move_unfinished_release_items",
    {
      description:
        "Move a release's unfinished milestones, Tasks and Bugs independently to another release of the same project, or to no release with null targetReleaseId. Completed work stays. Returns movedTaskIds and movedMilestoneIds.",
      inputSchema: z.object({
        releaseId: nonEmptyString.describe("The release to move items out of"),
        targetReleaseId: nonEmptyString
          .nullable()
          .describe("Another release of the project, or null for none"),
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/release/${encodeURIComponent(args.releaseId)}/move-unfinished`,
          {
            method: "POST",
            body: JSON.stringify({ targetReleaseId: args.targetReleaseId }),
          },
        ),
      ),
  );

  registerTool(
    "list_task_comments",
    {
      description: "List comments on a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "create_task_comment",
    {
      description: "Add a comment to a task.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        content: nonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.taskId)}`, {
          method: "POST",
          body: JSON.stringify({ content: args.content }),
        }),
      ),
  );

  registerTool(
    "update_task_comment",
    {
      description: "Update one of your comments on a task.",
      inputSchema: z.object({
        commentId: nonEmptyString,
        content: nonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.commentId)}`, {
          method: "PUT",
          body: JSON.stringify({ content: args.content }),
        }),
      ),
  );

  registerTool(
    "delete_task_comment",
    {
      description: "Delete one of your comments from a task.",
      inputSchema: z.object({ commentId: nonEmptyString }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.commentId)}`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "list_workspace_labels",
    {
      description: "List labels defined in a workspace.",
      inputSchema: z.object({ workspaceId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/label/workspace/${encodeURIComponent(args.workspaceId)}`,
          { method: "GET" },
        ),
      ),
  );

  registerTool(
    "create_label",
    {
      description:
        "Create a label in a workspace (optionally attach to a task).",
      inputSchema: z.object({
        name: nonEmptyString,
        color: hexColorSchema,
        workspaceId: nonEmptyString,
        taskId: optionalNonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json("/api/label", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            color: args.color,
            workspaceId: args.workspaceId,
            ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "attach_label_to_task",
    {
      description: "Attach an existing label to a task.",
      inputSchema: z.object({
        labelId: nonEmptyString,
        taskId: nonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/${encodeURIComponent(args.labelId)}/task`, {
          method: "PUT",
          body: JSON.stringify({ taskId: args.taskId }),
        }),
      ),
  );

  registerTool(
    "detach_label_from_task",
    {
      description: "Detach a label from its current task.",
      inputSchema: z.object({ labelId: nonEmptyString }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/${encodeURIComponent(args.labelId)}/task`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "create_task_relation",
    {
      description:
        "Create a relation between two Tasks or Bugs. relationType: 'blocks' (sourceTaskId blocks targetTaskId) or 'related' (bidirectional). Features do not have relations: a Feature on either end is refused with 400. 'subtask' is a deprecated alias that puts targetTaskId into sourceTaskId's feature (sourceTaskId must already be a Feature); prefer set_task_feature.",
      inputSchema: z.object({
        sourceTaskId: nonEmptyString,
        targetTaskId: nonEmptyString,
        relationType: z.enum(["subtask", "blocks", "related"]),
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json("/api/task-relation", {
          method: "POST",
          body: JSON.stringify({
            sourceTaskId: args.sourceTaskId,
            targetTaskId: args.targetTaskId,
            relationType: args.relationType,
          }),
        }),
      ),
  );

  registerTool(
    "get_task_relations",
    {
      description:
        "List the blocks and related relations of a Task or Bug; Features have none of those. Feature membership also appears as deprecated 'subtask' entries (sourceTaskId is the Feature, targetTaskId the task): one for a task in a Feature, and one per task for a Feature. Prefer featureId on get_task and list_tasks.",
      inputSchema: z.object({ taskId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "delete_task_relation",
    {
      description:
        "Delete a task relation by its relation ID. Deleting a 'subtask' entry (id 'feature:<taskId>:<featureId>') takes the task out of its feature; prefer set_task_feature with a null featureId.",
      inputSchema: z.object({ id: nonEmptyString }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.id)}`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "delete_label",
    {
      description:
        "Delete a task or workspace label by ID. Workspace-label cascades resume automatically; repeat the tool if pendingDeletion remains true.",
      inputSchema: z.object({ id: nonEmptyString }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      run(async () => {
        let result: unknown;
        const signal = AbortSignal.timeout(10_000);
        // Bound work per tool call. The API persists the continuation boundary.
        for (let page = 0; page < 100; page++) {
          if (page > 0 && signal.aborted) break;
          try {
            result = await client.json(
              `/api/label/${encodeURIComponent(args.id)}`,
              { method: "DELETE", signal },
            );
          } catch (error) {
            if (signal.aborted && result) break;
            throw error;
          }
          if (
            !result ||
            typeof result !== "object" ||
            !("pendingDeletion" in result) ||
            !result.pendingDeletion
          )
            break;
        }
        return result;
      }),
  );

  registerTool(
    "list_workspace_members",
    {
      description:
        "List the members of a workspace. Use this to resolve the user ID an assignee tool expects.",
      inputSchema: z.object({ workspaceId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/workspace/${encodeURIComponent(args.workspaceId)}/members`,
        ),
      ),
  );

  registerTool(
    "search",
    {
      description:
        "Search one workspace's Tasks, Bugs, Features, projects, comments, activities, Feature documents and project pages, plus your workspaces by name. Features come back as `feature` results, with `archived` and no status or priority. Comment and activity results carry the `taskId` and `taskType` of the item they belong to. Documents with a `featureId` belong to that Feature; documents without one are project pages.",
      inputSchema: z.object({
        q: nonEmptyString.describe("Search query"),
        type: z
          .enum([
            "all",
            "tasks",
            "features",
            "projects",
            "workspaces",
            "comments",
            "activities",
            "documents",
          ])
          .optional()
          .describe(
            "Restrict results to one kind. `tasks` returns Tasks and Bugs; `features` returns Features. Defaults to all.",
          ),
        workspaceId: nonEmptyString.describe(
          "The workspace to search (see list_workspaces)",
        ),
        projectId: optionalNonEmptyString.describe("Limit to one project"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum results, 1 to 50. Defaults to 20."),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const qs = new URLSearchParams({ q: args.q });
      if (args.type) qs.set("type", args.type);
      qs.set("workspaceId", args.workspaceId);
      if (args.projectId) qs.set("projectId", args.projectId);
      if (args.limit !== undefined) qs.set("limit", String(args.limit));
      return run(() => client.json(`/api/search?${qs.toString()}`));
    },
  );

  registerTool(
    "list_project_columns",
    {
      description:
        "List a project's columns. Their slugs are the values update_task_status and create_task accept as a status.",
      inputSchema: z.object({ projectId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/column/${encodeURIComponent(args.projectId)}`),
      ),
  );

  registerTool(
    "delete_task",
    {
      description:
        "Delete a task by ID. Deleting a feature keeps its tasks and takes them out of it.",
      inputSchema: z.object({ taskId: nonEmptyString }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/${encodeURIComponent(args.taskId)}`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "update_task_assignee",
    {
      description:
        "Assign a task to a workspace member, or pass a null userId to unassign it. Reassigning work whose dates were set by hand fails with TASK_ASSIGNEE_AWAY when the new assignee is away (approved time off or a public holiday) on its start or due day; pending requests never block. Planned work keeps its planned assignee until the next Apply.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        userId: nonEmptyString
          .nullable()
          .describe("Member user ID, or null to unassign"),
        timeZone: dayTimeZoneSchema,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/assignee/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            userId: args.userId,
            ...(args.timeZone ? { timeZone: args.timeZone } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "update_task_estimate",
    {
      description:
        "Set a Task/Bug effort estimate. Pass null to clear it. Planning sets dates from it on Apply.",
      inputSchema: z
        .object({
          taskId: nonEmptyString,
          estimateSeconds: estimateSecondsSchema,
        })
        .strict(),
      annotations: { readOnlyHint: false },
    },
    async ({ taskId, estimateSeconds }) =>
      run(async () => {
        const existing = await client.json<Record<string, unknown>>(
          `/api/task/${encodeURIComponent(taskId)}`,
        );
        return client.json(`/api/task/${encodeURIComponent(taskId)}`, {
          method: "PUT",
          body: JSON.stringify(
            buildFullTaskUpdateBody(existing, { estimateSeconds }),
          ),
        });
      }),
  );

  registerTool(
    "update_task_due_date",
    {
      description:
        "Set a Task/Bug due date by hand. Omit dueDate to clear it. Planned work stops following its estimate until the next Apply of its release. The due day can't be a day the assignee is away (approved time off or a public holiday), or it fails with TASK_ASSIGNEE_AWAY; pending requests never block. The day is read in timeZone when given, else the project's planning timezone (UTC when unset).",
      inputSchema: z
        .object({
          taskId: nonEmptyString,
          dueDate: optionalIsoDateTimeSchema,
          timeZone: dayTimeZoneSchema,
        })
        .strict(),
      annotations: { readOnlyHint: false },
    },
    async ({ taskId, dueDate, timeZone }) =>
      run(() =>
        client.json(`/api/task/due-date/${encodeURIComponent(taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            dueDate: dueDate ?? null,
            ...(timeZone ? { timeZone } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "list_task_time_entries",
    {
      description: "List the time entries logged against a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() =>
        client.json(`/api/time-entry/task/${encodeURIComponent(args.taskId)}`),
      ),
  );

  registerTool(
    "get_time_entry",
    {
      description: "Get a single time entry by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(() => client.json(`/api/time-entry/${encodeURIComponent(args.id)}`)),
  );

  registerTool(
    "create_time_entry",
    {
      description:
        "Log time against a task. Omit endTime to leave the entry running.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        startTime: isoDateTimeSchema,
        endTime: optionalIsoDateTimeSchema,
        description: optionalNonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json("/api/time-entry", {
          method: "POST",
          body: JSON.stringify({
            taskId: args.taskId,
            startTime: args.startTime,
            ...(args.endTime ? { endTime: args.endTime } : {}),
            ...(args.description ? { description: args.description } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "update_time_entry",
    {
      description:
        "Update a time entry. startTime is required; omitting endTime keeps the stored one. startTime cannot be later than the end time.",
      inputSchema: z.object({
        id: nonEmptyString,
        startTime: isoDateTimeSchema,
        endTime: optionalIsoDateTimeSchema,
        description: optionalNonEmptyString,
      }),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      run(() =>
        client.json(`/api/time-entry/${encodeURIComponent(args.id)}`, {
          method: "PUT",
          body: JSON.stringify({
            startTime: args.startTime,
            ...(args.endTime ? { endTime: args.endTime } : {}),
            ...(args.description ? { description: args.description } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "list_task_activity",
    {
      description: "List a task's activity history, newest first.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Most recent entries to return, 1 to 100. Omit for all."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ taskId, limit }) => {
      const query = limit === undefined ? "" : `?limit=${limit}`;
      return run(() =>
        client.json(`/api/activity/${encodeURIComponent(taskId)}${query}`),
      );
    },
  );

  registerTool(
    "list_notifications",
    {
      description: "List the signed-in user's notifications.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => run(() => client.json("/api/notification")),
  );
}
