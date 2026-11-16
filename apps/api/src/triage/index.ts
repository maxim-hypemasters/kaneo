import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { taskSchema } from "../task/response";
import { taskResource } from "../task/task-resource";
import { requireWorkItemPermission } from "../utils/require-work-item-permission";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { requireTriageAccess } from "./controllers/can-triage";
import getTriageMembers from "./controllers/get-members";
import replaceTriageMembers from "./controllers/replace-members";
import resolveTriage from "./controllers/resolve-triage";
import { triageMembersSchema } from "./response";
import {
  declineTriageBody,
  replaceTriageMembersBody,
  triageProjectParam,
  triageTaskParam,
} from "./schema";

const getMembersRoute = createRoute({
  method: "get",
  operationId: "getTriageMembers",
  path: "/project/{projectId}/members",
  tags: ["Triage"],
  summary: "Get triage members",
  description:
    "List the people who accept or decline new work in a project. While the list is not empty, Tasks and Bugs created by anyone else start in the Triage status.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: triageProjectParam },
  responses: {
    200: jsonResponse("The project's triage members", triageMembersSchema),
    403: errorResponse("No access to the project"),
    404: errorResponse("Project not found"),
  },
});

const replaceMembersRoute = createRoute({
  method: "put",
  operationId: "replaceTriageMembers",
  path: "/project/{projectId}/members",
  tags: ["Triage"],
  summary: "Replace triage members",
  description:
    "Replace a project's triage members. An empty list turns triage off; work already waiting stays in Triage until it is accepted or declined.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: triageProjectParam,
    body: {
      required: true,
      content: { "application/json": { schema: replaceTriageMembersBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated triage members", triageMembersSchema),
    400: errorResponse(
      "A user is not a workspace member or can't access the project",
    ),
    403: errorResponse(
      "No access to the project, or missing project:update permission",
    ),
    404: errorResponse("Project not found"),
  },
});

const triageErrors = {
  403: errorResponse(
    "No access to the project, missing update permission for the task's type, or not a triage member. With no triage members, project:update holders may triage.",
  ),
  404: errorResponse("Task not found"),
  409: errorResponse("The task is not waiting in Triage"),
};

const acceptRoute = createRoute({
  method: "post",
  operationId: "acceptTriageTask",
  path: "/task/{id}/accept",
  tags: ["Triage"],
  summary: "Accept triage task",
  description:
    "Accept a Task or Bug waiting in Triage. It moves to the To Do column, or to the project's first open column when there is no To Do, and its reporter is notified.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkItemPermission("update"),
    requireTriageAccess,
    requireEntitlement,
  ] as const,
  request: { params: triageTaskParam },
  responses: {
    200: jsonResponse("The accepted task", taskSchema),
    ...triageErrors,
  },
});

const declineRoute = createRoute({
  method: "post",
  operationId: "declineTriageTask",
  path: "/task/{id}/decline",
  tags: ["Triage"],
  summary: "Decline triage task",
  description:
    "Decline a Task or Bug waiting in Triage. It moves to Archived, an optional reason is posted as a comment, and its reporter is notified.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkItemPermission("update"),
    requireTriageAccess,
    requireEntitlement,
  ] as const,
  request: {
    params: triageTaskParam,
    body: {
      required: false,
      content: { "application/json": { schema: declineTriageBody } },
    },
  },
  responses: {
    200: jsonResponse("The declined task", taskSchema),
    400: errorResponse("Invalid body"),
    ...triageErrors,
  },
});

const triage = apiRouter()
  .openapi(getMembersRoute, async (c) =>
    c.json(await getTriageMembers(c.req.valid("param").projectId), 200),
  )
  .openapi(replaceMembersRoute, async (c) =>
    c.json(
      await replaceTriageMembers({
        projectId: c.req.valid("param").projectId,
        userIds: c.req.valid("json").userIds,
        currentUserId: c.get("userId"),
      }),
      200,
    ),
  )
  .openapi(acceptRoute, async (c) =>
    c.json(
      taskResource(
        await resolveTriage({
          taskId: c.req.valid("param").id,
          outcome: "accepted",
          currentUserId: c.get("userId"),
        }),
      ),
      200,
    ),
  )
  .openapi(declineRoute, async (c) =>
    c.json(
      taskResource(
        await resolveTriage({
          taskId: c.req.valid("param").id,
          outcome: "declined",
          reason: c.req.valid("json")?.reason,
          currentUserId: c.get("userId"),
        }),
      ),
      200,
    ),
  );

export default triage;
