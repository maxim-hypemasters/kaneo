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
import createRelease from "./controllers/create-release";
import deleteRelease from "./controllers/delete-release";
import moveUnfinishedItems from "./controllers/move-unfinished-items";
import updateRelease from "./controllers/update-release";
import { getRelease, listReleases } from "./read-releases";
import { readReleaseMilestones } from "./read-release-milestones";
import { readReleaseLinkCandidates } from "./read-link-candidates";
import {
  releaseLinkCandidatesQuery,
  releaseLinkCandidatesSchema,
} from "./link-candidates-schema";
import { milestoneScheduleQuery } from "../milestone/schema";
import { readReleaseProgress } from "./progress/read-release-progress";
import {
  releaseProgressHistorySchema,
  releaseProgressQuery,
} from "./progress/response";
import {
  deletedReleaseSchema,
  movedReleaseItemsSchema,
  releaseListSchema,
  releaseMilestoneListSchema,
  releaseSchema,
  releaseWithProgressSchema,
} from "./response";
import {
  createReleaseBody,
  moveUnfinishedBody,
  projectIdParam,
  releaseParam,
  updateReleaseBody,
} from "./schema";

const listProjectReleasesRoute = createRoute({
  method: "get",
  operationId: "listProjectReleases",
  path: "/project/{projectId}",
  tags: ["Releases"],
  summary: "List releases",
  description:
    "Get a project's releases with their progress, ordered by start date, then name.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The project's releases", releaseListSchema),
    403: errorResponse("No access to the project"),
    404: errorResponse("Project not found"),
    503: errorResponse("Release request timed out"),
  },
});

const getReleaseRoute = createRoute({
  method: "get",
  operationId: "getRelease",
  path: "/{id}",
  tags: ["Releases"],
  summary: "Get release",
  description: "Get a release with its progress.",
  middleware: [workspaceAccess.fromRelease("id")] as const,
  request: { params: releaseParam },
  responses: {
    200: jsonResponse("The release", releaseWithProgressSchema),
    403: errorResponse("No access to the release's project"),
    404: errorResponse("Release not found"),
    503: errorResponse("Release request timed out"),
  },
});

const getReleaseProgressRoute = createRoute({
  method: "get",
  operationId: "getReleaseProgress",
  path: "/{id}/progress",
  tags: ["Releases"],
  summary: "Get release progress history",
  description:
    "Daily Task/Bug scope, started and completed totals in the requested timezone. startScope is the net scope strictly before local midnight on the current release start date; it is null before the release starts or when tracking did not begin strictly before that boundary. Started includes completed tasks and tasks in nonfinal columns after the first nonfinal column. Archived tasks remain in scope. History begins when tracking was installed; earlier values are unknown. Future days are omitted, and unchanged days after submission are trimmed.",
  middleware: [workspaceAccess.fromRelease("id")] as const,
  request: { params: releaseParam, query: releaseProgressQuery },
  responses: {
    200: jsonResponse(
      "The release's task progress history",
      releaseProgressHistorySchema,
    ),
    400: errorResponse("Invalid timezone"),
    403: errorResponse("No access to the release's project"),
    404: errorResponse("Release not found"),
    503: errorResponse("Progress history unavailable or request timed out"),
  },
});

const getReleaseMilestonesRoute = createRoute({
  method: "get",
  operationId: "getReleaseMilestones",
  path: "/{id}/milestones",
  tags: ["Releases"],
  summary: "Get release feature milestone metadata",
  description:
    "Ordered metadata for explicitly assigned milestones and Features referenced by the release's nonarchived Tasks/Bugs. Includes empty milestones. Dates cover all linked nonarchived scheduled work in the requested timezone; displayed release progress remains release-scoped.",
  middleware: [
    workspaceAccess.fromRelease("id"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: releaseParam, query: milestoneScheduleQuery },
  responses: {
    200: jsonResponse(
      "The release's feature milestones",
      releaseMilestoneListSchema,
    ),
    400: errorResponse("Invalid timezone"),
    403: errorResponse(
      "No access to the release's project or missing task:read permission",
    ),
    404: errorResponse("Release not found"),
    409: errorResponse(
      "Release project or workspace changed; retry the request",
    ),
    503: errorResponse("Release milestones request timed out"),
  },
});

const getReleaseLinkCandidatesRoute = createRoute({
  method: "get",
  operationId: "getReleaseLinkCandidates",
  path: "/{id}/link-candidates",
  tags: ["Releases"],
  summary: "Find existing work to link to a release",
  description:
    "Paginated same-project candidates not explicitly assigned to this release. Task candidates include nonarchived Tasks and Bugs, including completed work. Milestone candidates include empty milestones and milestones owned by archived Features. Search matches task titles or identifiers, or milestone titles and owning Feature titles. Linking through the existing assignment endpoints moves membership from the current release; milestone follower rules remain in effect.",
  middleware: [
    workspaceAccess.fromRelease("id"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: releaseParam, query: releaseLinkCandidatesQuery },
  responses: {
    200: jsonResponse(
      "Existing work eligible to link",
      releaseLinkCandidatesSchema,
    ),
    400: errorResponse("Invalid candidate kind, search or pagination"),
    403: errorResponse("No project access or missing task:read permission"),
    404: errorResponse("Release not found"),
    409: errorResponse(
      "Release project or workspace changed; retry the request",
    ),
    503: errorResponse("Candidate request timed out"),
  },
});

const createReleaseRoute = createRoute({
  method: "post",
  operationId: "createRelease",
  path: "/project/{projectId}",
  tags: ["Releases"],
  summary: "Create release",
  description:
    "Add a release to a project. Its name must be unique in the project, and its dates must run start ≤ code freeze ≤ submission.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createReleaseBody } },
    },
  },
  responses: {
    200: jsonResponse("The created release", releaseSchema),
    400: errorResponse("Invalid body, or dates out of order"),
    402: errorResponse("Workspace plan has expired"),
    403: errorResponse(
      "No access to the project, or missing project:update permission",
    ),
    404: errorResponse("Project not found"),
    409: errorResponse("A release with this name already exists"),
  },
});

const updateReleaseRoute = createRoute({
  method: "put",
  operationId: "updateRelease",
  path: "/{id}",
  tags: ["Releases"],
  summary: "Update release",
  description:
    "Update a release. Omitted fields are left unchanged; the date order is checked against the stored dates.",
  middleware: [
    workspaceAccess.fromRelease("id"),
    requireWorkspacePermission({ project: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: releaseParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateReleaseBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated release", releaseSchema),
    400: errorResponse("Invalid body, or dates out of order"),
    402: errorResponse("Workspace plan has expired"),
    403: errorResponse(
      "No access to the release's project, or missing project:update permission",
    ),
    404: errorResponse("Release not found"),
    409: errorResponse("A release with this name already exists"),
  },
});

const deleteReleaseRoute = createRoute({
  method: "delete",
  operationId: "deleteRelease",
  path: "/{id}",
  tags: ["Releases"],
  summary: "Delete release",
  description:
    "Delete a release. Its features and tasks stay in the project, out of every release, and each records the change in its activity.",
  middleware: [
    workspaceAccess.fromRelease("id"),
    requireWorkspacePermission({ project: ["update"], task: ["update"] }),
  ] as const,
  request: { params: releaseParam },
  responses: {
    200: jsonResponse("The deleted release's id", deletedReleaseSchema),
    403: errorResponse(
      "No access to the release's project, or missing project:update or task:update permission",
    ),
    404: errorResponse("Release not found"),
    409: errorResponse(
      "Tasks kept joining or changing the release while it was deleted; try again",
    ),
  },
});

const moveUnfinishedRoute = createRoute({
  method: "post",
  operationId: "moveUnfinishedReleaseItems",
  path: "/{id}/move-unfinished",
  tags: ["Releases"],
  summary: "Move unfinished items",
  description:
    "Move the release's unfinished tasks and features (neither archived nor in a final column; planned ones count) to another release of the project, or out of every release with null. Each item moves on its own: a feature's tasks don't follow it, and finished items stay.",
  middleware: [
    workspaceAccess.fromRelease("id"),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: releaseParam,
    body: {
      required: true,
      content: { "application/json": { schema: moveUnfinishedBody } },
    },
  },
  responses: {
    200: jsonResponse("The items that moved", movedReleaseItemsSchema),
    400: errorResponse("Invalid body, or the target is this release"),
    402: errorResponse("Workspace plan has expired"),
    403: errorResponse(
      "No access to the release's project, or missing task:update permission",
    ),
    404: errorResponse(
      "Release not found, or the target isn't a release of its project",
    ),
    409: errorResponse(
      "Another edit changed these items at the same time; try again",
    ),
  },
});

const release = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(listProjectReleasesRoute, async (c) =>
    c.json(await listReleases(c.req.valid("param").projectId), 200),
  )
  .openapi(getReleaseRoute, async (c) =>
    c.json(await getRelease(c.req.valid("param").id), 200),
  )
  .openapi(getReleaseProgressRoute, async (c) =>
    c.json(
      await readReleaseProgress(
        c.req.valid("param").id,
        c.req.valid("query").timeZone,
      ),
      200,
    ),
  )
  .openapi(getReleaseMilestonesRoute, async (c) =>
    c.json(
      await readReleaseMilestones(
        c.req.valid("param").id,
        c.get("authorizedProjectId"),
        c.get("workspaceId"),
        c.req.valid("query").timeZone,
      ),
      200,
    ),
  )
  .openapi(getReleaseLinkCandidatesRoute, async (c) =>
    c.json(
      await readReleaseLinkCandidates(
        c.req.valid("param").id,
        c.get("authorizedProjectId"),
        c.get("workspaceId"),
        c.req.valid("query"),
      ),
      200,
    ),
  )
  .openapi(createReleaseRoute, async (c) =>
    c.json(
      await createRelease(c.req.valid("param").projectId, c.req.valid("json")),
      200,
    ),
  )
  .openapi(updateReleaseRoute, async (c) =>
    c.json(
      await updateRelease(c.req.valid("param").id, c.req.valid("json")),
      200,
    ),
  )
  .openapi(deleteReleaseRoute, async (c) =>
    c.json(await deleteRelease(c.req.valid("param").id, c.get("userId")), 200),
  )
  .openapi(moveUnfinishedRoute, async (c) =>
    c.json(
      await moveUnfinishedItems(
        c.req.valid("param").id,
        c.req.valid("json").targetReleaseId,
        c.get("userId"),
      ),
      200,
    ),
  );

export default release;
