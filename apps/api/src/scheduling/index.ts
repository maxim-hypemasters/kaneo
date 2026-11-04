import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { projectTable } from "../database/schema";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import releaseScheduling from "./release-routes";
import {
  applyBody,
  planningSettingsBody,
  previewBody,
  scheduleParam,
  schedulePreviewSchema,
  scheduleReadSchema,
  planningSettingsSchema,
} from "./schema";
import {
  applyProjectSchedule,
  getProjectSchedule,
  previewProjectSchedule,
  savePlanningSettings,
} from "./service";

const read = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ task: ["read"] }),
] as const;
const write = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ task: ["read", "update"], project: ["update"] }),
  requireEntitlement,
] as const;
const errors = {
  400: errorResponse("Invalid planning input or missing setup"),
  401: errorResponse("Authentication required"),
  403: errorResponse("No project access or permission"),
  404: errorResponse("Project not found"),
  409: errorResponse("Preview is stale or expired"),
  422: errorResponse(
    "PLAN_AFTER_CODE_FREEZE: resolve work finishing after code freeze",
  ),
};
const readRoute = createRoute({
  method: "get",
  path: "/{projectId}",
  operationId: "getProjectSchedule",
  tags: ["Planning"],
  summary: "Read the applied project schedule and input revision",
  middleware: [...read],
  request: { params: scheduleParam },
  responses: {
    200: jsonResponse("Applied schedule", scheduleReadSchema),
    ...errors,
  },
});
const previewRoute = createRoute({
  method: "post",
  path: "/{projectId}/preview",
  operationId: "previewProjectSchedule",
  tags: ["Planning"],
  summary: "Preview a capacity-based project schedule without publishing",
  middleware: [...write],
  request: {
    params: scheduleParam,
    body: {
      required: true,
      content: { "application/json": { schema: previewBody } },
    },
  },
  responses: {
    200: jsonResponse("Reviewed schedule proposal", schedulePreviewSchema),
    ...errors,
  },
});
const applyRoute = createRoute({
  method: "post",
  path: "/{projectId}/apply",
  operationId: "applyProjectSchedule",
  tags: ["Planning"],
  summary: "Atomically apply a revision-checked project schedule",
  middleware: [...write],
  request: {
    params: scheduleParam,
    body: {
      required: true,
      content: { "application/json": { schema: applyBody } },
    },
  },
  responses: {
    200: jsonResponse("Applied schedule", scheduleReadSchema),
    ...errors,
  },
});
const readSettingsRoute = createRoute({
  method: "get",
  path: "/{projectId}/settings",
  operationId: "getPlanningSettings",
  tags: ["Planning"],
  summary: "Read estimate conversion and planning timezone",
  middleware: [...read],
  request: { params: scheduleParam },
  responses: {
    200: jsonResponse("Planning settings", planningSettingsSchema),
    ...errors,
  },
});
const settingsRoute = createRoute({
  method: "put",
  path: "/{projectId}/settings",
  operationId: "updatePlanningSettings",
  tags: ["Planning"],
  summary: "Set the project planning timezone and estimate day conversion",
  middleware: [...write],
  request: {
    params: scheduleParam,
    body: {
      required: true,
      content: { "application/json": { schema: planningSettingsBody } },
    },
  },
  responses: {
    200: jsonResponse("Updated schedule setup", scheduleReadSchema),
    ...errors,
  },
});
const scheduling = apiRouter<BaseVariables & { workspaceId: string }>()
  .route("/", releaseScheduling)
  .openapi(readRoute, async (c) =>
    c.json(
      await getProjectSchedule(
        c.req.valid("param").projectId,
        c.get("userId"),
        c.get("workspaceId"),
      ),
      200,
    ),
  )
  .openapi(readSettingsRoute, async (c) => {
    const [project] = await db
      .select({
        timeZone: projectTable.planningTimeZone,
        estimateDayMinutes: projectTable.estimateDayMinutes,
      })
      .from(projectTable)
      .where(
        and(
          eq(projectTable.id, c.req.valid("param").projectId),
          eq(projectTable.workspaceId, c.get("workspaceId")),
        ),
      );
    if (!project)
      throw new HTTPException(409, {
        message: "Project changed workspaces; retry",
      });
    return c.json(project, 200);
  })
  .openapi(previewRoute, async (c) =>
    c.json(
      await previewProjectSchedule(
        c.req.valid("param").projectId,
        c.get("userId"),
        c.req.valid("json").planFrom,
        c.get("workspaceId"),
      ),
      200,
    ),
  )
  .openapi(applyRoute, async (c) =>
    c.json(
      await applyProjectSchedule(
        c.req.valid("param").projectId,
        c.get("userId"),
        c.req.valid("json"),
        c.get("workspaceId"),
      ),
      200,
    ),
  )
  .openapi(settingsRoute, async (c) => {
    const projectId = c.req.valid("param").projectId;
    const { timeZone, estimateDayMinutes } = c.req.valid("json");
    return c.json(
      await savePlanningSettings(
        projectId,
        c.get("userId"),
        c.get("workspaceId"),
        { timeZone, estimateDayMinutes },
      ),
      200,
    );
  });
export default scheduling;
