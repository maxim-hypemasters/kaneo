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
import createProjectLink from "./controllers/create-project-link";
import deleteProjectLink from "./controllers/delete-project-link";
import reorderProjectLinks from "./controllers/reorder-project-links";
import updateProjectLink from "./controllers/update-project-link";
import { readProjectLinks } from "./read-project-links";
import {
  deletedProjectLinkSchema,
  projectLinkListSchema,
  projectLinkSchema,
} from "./response";
import {
  createProjectLinkBody,
  projectLinkParam,
  projectLinkProjectParam,
  reorderProjectLinksBody,
  updateProjectLinkBody,
} from "./schema";

// Every route carries the project in its path: the access middleware resolves
// the workspace from it, and controllers bind link ids to that project.

const writeErrors = {
  402: errorResponse("Workspace plan has expired"),
  403: errorResponse(
    "No access to the project, or missing project:edit_details permission",
  ),
};

const listProjectLinksRoute = createRoute({
  method: "get",
  operationId: "listProjectLinks",
  path: "/project/{projectId}",
  tags: ["Project links"],
  summary: "List project links",
  description:
    "List the links in a project's Resources, in the order people arranged them. Anyone with access to the project can read them.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectLinkProjectParam },
  responses: {
    200: jsonResponse("The project's links", projectLinkListSchema),
    403: errorResponse("No access to the project"),
    404: errorResponse("Project not found"),
  },
});

const createProjectLinkRoute = createRoute({
  method: "post",
  operationId: "createProjectLink",
  path: "/project/{projectId}",
  tags: ["Project links"],
  summary: "Add project link",
  description:
    "Add a titled link to a project's Resources, after the links already there. A project holds at most 100 links. Needs project:edit_details.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["edit_details"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: projectLinkProjectParam,
    body: {
      required: true,
      content: { "application/json": { schema: createProjectLinkBody } },
    },
  },
  responses: {
    200: jsonResponse("The added link", projectLinkSchema),
    400: errorResponse("Invalid URL or title"),
    ...writeErrors,
    404: errorResponse("Project not found"),
    409: errorResponse("The project already has 100 links"),
  },
});

const reorderProjectLinksRoute = createRoute({
  method: "put",
  operationId: "reorderProjectLinks",
  path: "/project/{projectId}/reorder",
  tags: ["Project links"],
  summary: "Reorder project links",
  description:
    "Set the order of a project's Resources. Needs project:edit_details.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["edit_details"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: projectLinkProjectParam,
    body: {
      required: true,
      content: { "application/json": { schema: reorderProjectLinksBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "The project's links in their new order",
      projectLinkListSchema,
    ),
    400: errorResponse(
      "Duplicate link ids, or a link does not belong to this project",
    ),
    ...writeErrors,
    404: errorResponse("Project not found"),
  },
});

const updateProjectLinkRoute = createRoute({
  method: "patch",
  operationId: "updateProjectLink",
  path: "/project/{projectId}/{id}",
  tags: ["Project links"],
  summary: "Update project link",
  description:
    "Change a project link's URL, title, or both. Needs project:edit_details.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["edit_details"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: projectLinkParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateProjectLinkBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated link", projectLinkSchema),
    400: errorResponse("Invalid URL or title, or nothing to change"),
    ...writeErrors,
    404: errorResponse("Project or link not found"),
  },
});

const deleteProjectLinkRoute = createRoute({
  method: "delete",
  operationId: "deleteProjectLink",
  path: "/project/{projectId}/{id}",
  tags: ["Project links"],
  summary: "Remove project link",
  description:
    "Remove a link from a project's Resources. Needs project:edit_details.",
  // Removing stays possible after a plan expires, as with other deletes.
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["edit_details"] }),
  ] as const,
  request: { params: projectLinkParam },
  responses: {
    200: jsonResponse("The removed link's id", deletedProjectLinkSchema),
    403: writeErrors[403],
    404: errorResponse("Project or link not found"),
  },
});

const projectLink = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(listProjectLinksRoute, async (c) =>
    c.json(await readProjectLinks(c.req.valid("param").projectId), 200),
  )
  .openapi(createProjectLinkRoute, async (c) =>
    c.json(
      await createProjectLink({
        projectId: c.req.valid("param").projectId,
        ...c.req.valid("json"),
      }),
      200,
    ),
  )
  .openapi(reorderProjectLinksRoute, async (c) =>
    c.json(
      await reorderProjectLinks({
        projectId: c.req.valid("param").projectId,
        links: c.req.valid("json").links,
      }),
      200,
    ),
  )
  .openapi(updateProjectLinkRoute, async (c) =>
    c.json(
      await updateProjectLink({
        ...c.req.valid("param"),
        ...c.req.valid("json"),
      }),
      200,
    ),
  )
  .openapi(deleteProjectLinkRoute, async (c) =>
    c.json(await deleteProjectLink(c.req.valid("param")), 200),
  );

export default projectLink;
