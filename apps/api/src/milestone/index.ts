import { eq } from "drizzle-orm";
import { milestoneTable } from "../database/schema";
import { readProjectMilestones } from "./read-project-milestones";
import db from "../database";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import { draftWorkItemTypes } from "../task/controllers/require-task-permission";
import { readJsonObjectBody } from "../utils/read-json-object-body";
import {
  stringIds,
  workItemPermissionsForIds,
} from "../utils/require-work-item-permission";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import {
  mergePermissions,
  workItemPermissions,
} from "../utils/work-item-permissions";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { readMilestone, readMilestones } from "./read-milestones";
import {
  createMilestoneBody,
  featureParam,
  milestoneParam,
  milestoneSchema,
  milestoneScheduleQuery,
  projectMilestonesQuery,
  projectMilestonesSchema,
  reorderMilestonesBody,
  updateMilestoneBody,
} from "./schema";
import {
  createMilestone,
  deleteMilestone,
  reorderMilestones,
  updateMilestone,
} from "./write-milestones";

const readFeature = [
  workspaceAccess.fromTask("featureId"),
  requireWorkspacePermission({ milestone: ["read"] }),
] as const;
const featureMilestones = (action: "create" | "update") =>
  [
    workspaceAccess.fromTask("featureId"),
    requireWorkspacePermission({ milestone: [action] }),
    requireEntitlement,
  ] as const;
const readItem = [
  workspaceAccess.fromMilestone("id"),
  requireWorkspacePermission({ milestone: ["read"] }),
] as const;
const writeItem = (action: "update" | "delete") =>
  [
    workspaceAccess.fromMilestone("id"),
    requireWorkspacePermission({ milestone: [action] }),
    requireEntitlement,
  ] as const;
const errors = {
  400: errorResponse("Invalid milestone data"),
  403: errorResponse("No access or missing milestone permission"),
  404: errorResponse("Feature or milestone not found"),
  409: errorResponse(
    "The owner is not a feature, or the milestone list changed",
  ),
};
const projectRoute = createRoute({
  method: "get",
  operationId: "listProjectMilestones",
  path: "/project/{projectId}",
  tags: ["Milestones"],
  summary: "List project milestone planning summaries",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ milestone: ["read"] }),
  ] as const,
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    query: projectMilestonesQuery,
  },
  responses: {
    200: jsonResponse(
      "Paginated milestones with full linked-work progress",
      projectMilestonesSchema,
    ),
    ...errors,
  },
});
const requireMilestoneLeadPermission = async (
  c: import("hono").Context,
  next: import("hono").Next,
) => {
  const body: unknown = await c.req.json().catch(() => ({}));
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.hasOwn(body, "leadId")
  ) {
    const leadId = (body as { leadId?: unknown }).leadId;
    if (typeof leadId !== "string" && leadId !== null) return next();
    const id = c.req.param("id");
    const current = id
      ? await db.query.milestoneTable.findFirst({
          columns: { leadId: true },
          where: eq(milestoneTable.id, id),
        })
      : null;
    if ((current?.leadId ?? null) !== leadId)
      return requireWorkspacePermission({ task: ["assign"] })(c, next);
  }
  return next();
};
// New drafts need create, and linked work needs update, on their own types.
const requireMilestoneWorkPermission = async (
  c: import("hono").Context,
  next: import("hono").Next,
) => {
  const { newTasks, taskIds } = await readJsonObjectBody(c);
  const drafts = draftWorkItemTypes(newTasks);
  const required = mergePermissions(
    drafts.length > 0 ? workItemPermissions(drafts, "create") : undefined,
    await workItemPermissionsForIds(stringIds(taskIds), "update"),
  );
  if (Object.keys(required).length === 0) return next();
  return requireWorkspacePermission(required)(c, next);
};
const listRoute = createRoute({
  method: "get",
  operationId: "listFeatureMilestones",
  path: "/feature/{featureId}",
  tags: ["Milestones"],
  summary: "List feature milestones",
  middleware: [...readFeature],
  request: { params: featureParam, query: milestoneScheduleQuery },
  responses: {
    200: jsonResponse(
      "Ordered milestones and unfiltered task/bug progress",
      z.array(milestoneSchema),
    ),
    ...errors,
  },
});
const createMilestoneRoute = createRoute({
  method: "post",
  operationId: "createMilestone",
  path: "/feature/{featureId}",
  tags: ["Milestones"],
  summary: "Create a feature milestone",
  description:
    "Atomically create a milestone, link existing Tasks/Bugs from its Feature, and optionally create up to 100 title-only Tasks/Bugs. Requires milestone:create; new work requires create, and linked work update, permission for its type (task or bug). New work inherits the selected release. Required custom fields must have valid defaults. Validation or insertion failure rolls back all work and number allocation. Duplicate ids return 400; missing, moved, deleted, nonleaf or outside-Feature selections return 409.",
  middleware: [
    ...featureMilestones("create"),
    requireMilestoneLeadPermission,
    requireMilestoneWorkPermission,
  ],
  request: {
    params: featureParam,
    query: milestoneScheduleQuery,
    body: {
      required: true,
      content: { "application/json": { schema: createMilestoneBody } },
    },
  },
  responses: {
    200: jsonResponse("The created milestone", milestoneSchema),
    ...errors,
    402: errorResponse("Workspace plan has expired"),
  },
});
const reorderRoute = createRoute({
  method: "put",
  operationId: "reorderMilestones",
  path: "/feature/{featureId}/order",
  tags: ["Milestones"],
  summary: "Reorder all milestones in a feature",
  description:
    "Accepts the complete ordered id list. Duplicate ids return 400; a list that is no longer the exact current set returns 409.",
  middleware: [...featureMilestones("update")],
  request: {
    params: featureParam,
    query: milestoneScheduleQuery,
    body: {
      required: true,
      content: { "application/json": { schema: reorderMilestonesBody } },
    },
  },
  responses: {
    200: jsonResponse("The reordered milestones", z.array(milestoneSchema)),
    ...errors,
    402: errorResponse("Workspace plan has expired"),
  },
});
const getRoute = createRoute({
  method: "get",
  operationId: "getMilestone",
  path: "/{id}",
  tags: ["Milestones"],
  summary: "Get milestone",
  middleware: [...readItem],
  request: { params: milestoneParam, query: milestoneScheduleQuery },
  responses: { 200: jsonResponse("The milestone", milestoneSchema), ...errors },
});
const updateRoute = createRoute({
  method: "patch",
  operationId: "updateMilestone",
  path: "/{id}",
  tags: ["Milestones"],
  summary: "Update milestone metadata",
  middleware: [...writeItem("update"), requireMilestoneLeadPermission],
  request: {
    params: milestoneParam,
    query: milestoneScheduleQuery,
    body: {
      required: true,
      content: { "application/json": { schema: updateMilestoneBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated milestone", milestoneSchema),
    ...errors,
    402: errorResponse("Workspace plan has expired"),
  },
});
const deleteRoute = createRoute({
  method: "delete",
  operationId: "deleteMilestone",
  path: "/{id}",
  tags: ["Milestones"],
  summary: "Delete milestone",
  description:
    "Unlinks its tasks and bugs while keeping their feature, release and other fields.",
  middleware: [...writeItem("delete")],
  request: { params: milestoneParam },
  responses: {
    200: jsonResponse("Deleted milestone id", z.object({ id: z.string() })),
    ...errors,
    402: errorResponse("Workspace plan has expired"),
  },
});

export default apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(projectRoute, async (c) =>
    c.json(
      await readProjectMilestones(
        c.req.valid("param").projectId,
        c.req.valid("query").page,
        c.req.valid("query").limit,
        c.get("workspaceId"),
        c.req.valid("query").timeZone,
      ),
      200,
    ),
  )
  .openapi(listRoute, async (c) =>
    c.json(
      await db.transaction((tx) =>
        readMilestones(
          c.req.valid("param").featureId,
          tx,
          c.get("authorizedProjectId"),
          c.get("workspaceId"),
          c.req.valid("query").timeZone,
        ),
      ),
      200,
    ),
  )
  .openapi(createMilestoneRoute, async (c) =>
    c.json(
      await createMilestone(
        c.req.valid("param").featureId,
        c.req.valid("json"),
        c.get("userId"),
        c.get("authorizedProjectId"),
        c.get("workspaceId"),
        c.req.valid("query").timeZone,
      ),
      200,
    ),
  )
  .openapi(reorderRoute, async (c) =>
    c.json(
      await reorderMilestones(
        c.req.valid("param").featureId,
        c.req.valid("json").milestoneIds,
        c.get("userId"),
        c.get("authorizedProjectId"),
        c.get("workspaceId"),
        c.req.valid("query").timeZone,
      ),
      200,
    ),
  )
  .openapi(getRoute, async (c) =>
    c.json(
      await db.transaction((tx) =>
        readMilestone(
          c.req.valid("param").id,
          tx,
          c.get("authorizedProjectId"),
          c.get("workspaceId"),
          c.req.valid("query").timeZone,
        ),
      ),
      200,
    ),
  )
  .openapi(updateRoute, async (c) =>
    c.json(
      await updateMilestone(
        c.req.valid("param").id,
        c.req.valid("json"),
        c.get("userId"),
        c.get("authorizedProjectId"),
        c.get("workspaceId"),
        c.req.valid("query").timeZone,
      ),
      200,
    ),
  )
  .openapi(deleteRoute, async (c) =>
    c.json(
      await deleteMilestone(
        c.req.valid("param").id,
        c.get("userId"),
        c.get("authorizedProjectId"),
        c.get("workspaceId"),
      ),
      200,
    ),
  );
