import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { PLANNING_READ, PLANNING_WRITE } from "./planning-permissions";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import {
  releaseApplyBody,
  releasePlanningQuery,
  releasePreviewBody,
  releaseScheduleParam,
  releaseSchedulePreviewSchema,
  releaseScheduleReadSchema,
} from "./release-schema";
import {
  applyReleaseSchedule,
  getReleaseSchedule,
  previewReleaseSchedule,
} from "./release-service";

const read = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission(PLANNING_READ),
] as const;
const write = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission(PLANNING_WRITE),
  requireEntitlement,
] as const;
const errors = {
  400: errorResponse("Invalid planning input"),
  401: errorResponse("Authentication required"),
  403: errorResponse("No permission or project access"),
  404: errorResponse("Release not found in this project"),
  409: errorResponse("Planning inputs changed; recalculate"),
  422: errorResponse(
    "PLAN_AFTER_CODE_FREEZE: resolve work finishing after code freeze",
  ),
};
const readRoute = createRoute({
  method: "get",
  path: "/{projectId}/release/{releaseId}",
  operationId: "getReleaseSchedule",
  tags: ["Planning"],
  summary:
    "Read this release's published planning state and complete work context",
  middleware: [...read],
  request: { params: releaseScheduleParam, query: releasePlanningQuery },
  responses: {
    200: jsonResponse("Release planning state", releaseScheduleReadSchema),
    ...errors,
  },
});
const previewRoute = createRoute({
  method: "post",
  path: "/{projectId}/release/{releaseId}/preview",
  operationId: "previewReleaseSchedule",
  tags: ["Planning"],
  summary:
    "Preview only this release with default weekday availability, reserving other releases' published work",
  middleware: [...write],
  request: {
    params: releaseScheduleParam,
    body: {
      required: true,
      content: { "application/json": { schema: releasePreviewBody } },
    },
  },
  responses: {
    200: jsonResponse("Release plan proposal", releaseSchedulePreviewSchema),
    ...errors,
  },
});
const applyRoute = createRoute({
  method: "post",
  path: "/{projectId}/release/{releaseId}/apply",
  operationId: "applyReleaseSchedule",
  tags: ["Planning"],
  summary:
    "Apply only the selected release after checking the complete project snapshot",
  middleware: [...write],
  request: {
    params: releaseScheduleParam,
    body: {
      required: true,
      content: { "application/json": { schema: releaseApplyBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "Published release planning state",
      releaseScheduleReadSchema,
    ),
    ...errors,
  },
});

const releaseScheduling = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(readRoute, async (c) => {
    const { projectId, releaseId } = c.req.valid("param");
    return c.json(
      await getReleaseSchedule(
        projectId,
        releaseId,
        c.get("userId"),
        c.get("workspaceId"),
        c.req.valid("query").timeZone,
      ),
      200,
    );
  })
  .openapi(previewRoute, async (c) => {
    const { projectId, releaseId } = c.req.valid("param");
    return c.json(
      await previewReleaseSchedule(
        projectId,
        releaseId,
        c.get("userId"),
        c.get("workspaceId"),
        c.req.valid("json").timeZone,
        c.req.valid("json").changes,
      ),
      200,
    );
  })
  .openapi(applyRoute, async (c) => {
    const { projectId, releaseId } = c.req.valid("param");
    return c.json(
      await applyReleaseSchedule(
        projectId,
        releaseId,
        c.get("userId"),
        c.req.valid("json"),
        c.get("workspaceId"),
      ),
      200,
    );
  });
export default releaseScheduling;
