import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { createProjectDocument } from "./create-project-document";
import { deleteProjectDocument } from "./delete-project-document";
import { getProjectDocument } from "./get-project-document";
import { listProjectDocuments } from "./list-project-documents";
import { moveProjectDocument } from "./move-project-document";
import { pruneProjectDocumentAssets } from "./prune-project-document-assets";
import {
  createProjectDocumentBody,
  deletedProjectDocumentSchema,
  documentParams,
  moveProjectDocumentBody,
  type ProjectDocumentScope,
  projectDocumentSchema,
  projectDocumentTreeSchema,
  projectParams,
  pruneAssetsResultSchema,
  pruneProjectDocumentAssetsBody,
  updateProjectDocumentBody,
} from "./schema";
import { updateProjectDocument } from "./update-project-document";

// Project pages follow the same permissions as Feature documents.
const projectRead = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ task: ["read"] }),
] as const;
const projectWrite = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ task: ["update"] }),
  requireEntitlement,
] as const;
const read = [
  workspaceAccess.fromProjectDocument("id"),
  requireWorkspacePermission({ task: ["read"] }),
] as const;
const write = [
  workspaceAccess.fromProjectDocument("id"),
  requireWorkspacePermission({ task: ["update"] }),
  requireEntitlement,
] as const;
const remove = [
  workspaceAccess.fromProjectDocument("id"),
  requireWorkspacePermission({ task: ["delete"] }),
  requireEntitlement,
] as const;
const errors = {
  400: errorResponse("Invalid page"),
  402: errorResponse("Workspace plan expired"),
  403: errorResponse("No access or missing permission"),
  404: errorResponse("Project or page not found"),
  409: errorResponse("Content changed; refresh and retry"),
};
const tags = ["Project documents"];
const scope = (c: {
  get: (key: "userId" | "authorizedProjectId" | "workspaceId") => string;
}): ProjectDocumentScope => ({
  projectId: c.get("authorizedProjectId"),
  workspaceId: c.get("workspaceId"),
  userId: c.get("userId"),
});
const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

const projectDocument = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "listProjectDocuments",
      path: "/project/{projectId}",
      tags,
      summary: "List a project's documents",
      description:
        "Returns the project's page tree and the documents of every active Feature in the project, without bodies. Pages are ordered by position within their parent; Feature documents are newest first.",
      middleware: [...projectRead],
      request: { params: projectParams },
      responses: {
        200: jsonResponse(
          "Page tree and Feature documents",
          projectDocumentTreeSchema,
        ),
        ...errors,
      },
    }),
    async (c) => c.json(await listProjectDocuments(scope(c)), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "createProjectDocument",
      path: "/project/{projectId}",
      tags,
      summary: "Create a project page",
      middleware: [...projectWrite],
      request: {
        params: projectParams,
        body: json(createProjectDocumentBody),
      },
      responses: {
        200: jsonResponse("Created page", projectDocumentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(await createProjectDocument(scope(c), c.req.valid("json")), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getProjectDocument",
      path: "/{id}",
      tags,
      summary: "Read a project page",
      middleware: [...read],
      request: { params: documentParams },
      responses: {
        200: jsonResponse("Page and revision", projectDocumentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(await getProjectDocument(scope(c), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "updateProjectDocument",
      path: "/{id}",
      tags,
      summary: "Save or rename a project page",
      description:
        "Compares expectedRevision while locked. A stale revision returns DOCUMENT_CONFLICT and saves nothing. Referenced staged uploads are claimed atomically. Uploads removed from the body are deleted unless keepRemovedAssets is true.",
      middleware: [...write],
      request: {
        params: documentParams,
        body: json(updateProjectDocumentBody),
      },
      responses: {
        200: jsonResponse(
          "Saved page and incremented revision",
          projectDocumentSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await updateProjectDocument(
          scope(c),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "moveProjectDocument",
      path: "/{id}/move",
      tags,
      summary: "Move a project page",
      description:
        "Moves the page and its sub-pages under another page in the same project, or to the top level, at the given position. Moving a page into itself or one of its sub-pages returns 400.",
      middleware: [...write],
      request: {
        params: documentParams,
        body: json(moveProjectDocumentBody),
      },
      responses: {
        200: jsonResponse("Moved page", projectDocumentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await moveProjectDocument(
          scope(c),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "deleteProjectDocument",
      path: "/{id}",
      tags,
      summary: "Delete a project page",
      description:
        "Deletes the page together with all of its sub-pages and their uploads.",
      middleware: [...remove],
      request: { params: documentParams },
      responses: {
        200: jsonResponse("Deleted page", deletedProjectDocumentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await deleteProjectDocument(scope(c), c.req.valid("param").id),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "pruneProjectDocumentAssets",
      path: "/{id}/assets/prune",
      tags,
      summary: "Delete removed page uploads",
      description:
        "Deletes the listed uploads of this page that its body no longer references, such as uploads kept by saves with keepRemovedAssets. Other ids are skipped. Storage objects are removed in the background.",
      middleware: [...write],
      request: {
        params: documentParams,
        body: json(pruneProjectDocumentAssetsBody),
      },
      responses: {
        200: jsonResponse(
          "Ids of the deleted uploads",
          pruneAssetsResultSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await pruneProjectDocumentAssets(
          scope(c),
          c.req.valid("param").id,
          c.req.valid("json").assetIds,
        ),
        200,
      ),
  );

export default projectDocument;
