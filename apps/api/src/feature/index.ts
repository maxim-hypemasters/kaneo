import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import {
  createFeatureDocument,
  deleteFeatureDocument,
  getFeatureDocument,
  listFeatureDocuments,
  updateFeatureDocument,
} from "./documents";
import { readFeatureIssues } from "./issues";
import {
  activityPageSchema,
  createDocumentBody,
  documentPageSchema,
  documentParams,
  documentSchema,
  featureReportSchema,
  featureParams,
  issuePageSchema,
  issuesQuery,
  pageQuery,
  searchQuery,
  updateBody,
  updateDocumentBody,
  updateParams,
  type FeatureScope,
} from "./schema";
import {
  editFeatureUpdate,
  getFeatureUpdate,
  latestFeatureUpdate,
  publishFeatureUpdate,
  readFeatureActivity,
} from "./updates";

const read = [
  workspaceAccess.fromTask("id"),
  requireWorkspacePermission({ task: ["read"] }),
] as const;
const write = [
  workspaceAccess.fromTask("id"),
  requireWorkspacePermission({ task: ["update"] }),
  requireEntitlement,
] as const;
const removeDocument = [
  workspaceAccess.fromTask("id"),
  requireWorkspacePermission({ task: ["delete"] }),
  requireEntitlement,
] as const;
const errors = {
  400: errorResponse("Invalid Feature content"),
  403: errorResponse("No access or missing permission"),
  404: errorResponse("Feature or content not found"),
  409: errorResponse("Content changed; refresh and retry"),
  402: errorResponse("Workspace plan expired"),
};
const tags = ["Features"];
const scope = (c: {
  req: { param: (key: string) => string | undefined };
  get: (key: "userId" | "authorizedProjectId" | "workspaceId") => string;
}): FeatureScope => ({
  featureId: c.req.param("id")!,
  userId: c.get("userId"),
  projectId: c.get("authorizedProjectId"),
  workspaceId: c.get("workspaceId"),
});
const feature = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "getLatestFeatureUpdate",
      path: "/{id}/updates/latest",
      tags,
      summary: "Get the latest published Feature update",
      middleware: [...read],
      request: { params: featureParams },
      responses: {
        200: jsonResponse(
          "Latest official report, or null",
          featureReportSchema.nullable(),
        ),
        ...errors,
      },
    }),
    async (c) => c.json(await latestFeatureUpdate(scope(c)), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getFeatureUpdate",
      path: "/{id}/updates/{updateId}",
      tags,
      summary: "Read a published Feature update",
      description:
        "Resolve an official report directly, even when newer activity puts it outside the current feed page. The Feature owns the lookup and historical access redaction still applies.",
      middleware: [...read],
      request: { params: updateParams },
      responses: {
        200: jsonResponse(
          "Official update and immutable progress snapshot",
          featureReportSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await getFeatureUpdate(scope(c), c.req.valid("param").updateId),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getFeatureActivity",
      path: "/{id}/activity",
      tags,
      summary: "Get paginated Feature activity",
      middleware: [...read],
      request: { params: featureParams, query: pageQuery },
      responses: {
        200: jsonResponse(
          "Comments, official updates and system history, newest first",
          activityPageSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(await readFeatureActivity(scope(c), c.req.valid("query")), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "publishFeatureUpdate",
      path: "/{id}/updates",
      tags,
      summary: "Publish a Feature health and milestone progress update",
      description:
        "Snapshots whole-milestone Task/Bug progress on the server, independently of visible Issues filters. Feature publication is serialized; clients cannot supply snapshots.",
      middleware: [...write],
      request: {
        params: featureParams,
        body: {
          required: true,
          content: { "application/json": { schema: updateBody } },
        },
      },
      responses: {
        200: jsonResponse("Published report", featureReportSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(await publishFeatureUpdate(scope(c), c.req.valid("json")), 200),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "editFeatureUpdate",
      path: "/{id}/updates/{updateId}",
      tags,
      summary: "Edit an official update's note and health",
      description:
        "Only the author may edit. Captured milestone names, progress and previous-report totals are immutable.",
      middleware: [...write],
      request: {
        params: updateParams,
        body: {
          required: true,
          content: { "application/json": { schema: updateBody } },
        },
      },
      responses: {
        200: jsonResponse("Updated report", featureReportSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await editFeatureUpdate(
          scope(c),
          c.req.valid("param").updateId,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "deleteFeatureUpdate",
      path: "/{id}/updates/{updateId}",
      tags,
      summary: "Delete an official update",
      description:
        "Only the author may delete an official update, following comment ownership rules.",
      middleware: [...write],
      request: { params: updateParams },
      responses: {
        200: jsonResponse("Deleted report", featureReportSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await editFeatureUpdate(scope(c), c.req.valid("param").updateId, null),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listFeatureDocuments",
      path: "/{id}/documents",
      tags,
      summary: "Search Feature documents",
      middleware: [...read],
      request: { params: featureParams, query: searchQuery },
      responses: {
        200: jsonResponse(
          "Bounded document summaries, most recently updated first",
          documentPageSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(await listFeatureDocuments(scope(c), c.req.valid("query")), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "createFeatureDocument",
      path: "/{id}/documents",
      tags,
      summary: "Create a Feature document",
      middleware: [...write],
      request: {
        params: featureParams,
        body: {
          required: true,
          content: { "application/json": { schema: createDocumentBody } },
        },
      },
      responses: {
        200: jsonResponse("Created document", documentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(await createFeatureDocument(scope(c), c.req.valid("json")), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getFeatureDocument",
      path: "/{id}/documents/{documentId}",
      tags,
      summary: "Read a Feature document",
      middleware: [...read],
      request: { params: documentParams },
      responses: {
        200: jsonResponse("Document and revision", documentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await getFeatureDocument(scope(c), c.req.valid("param").documentId),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "updateFeatureDocument",
      path: "/{id}/documents/{documentId}",
      tags,
      summary: "Save or rename a Feature document",
      description:
        "Compares expectedRevision while locked. A stale revision returns DOCUMENT_CONFLICT and saves nothing. Referenced staged assets are claimed atomically.",
      middleware: [...write],
      request: {
        params: documentParams,
        body: {
          required: true,
          content: { "application/json": { schema: updateDocumentBody } },
        },
      },
      responses: {
        200: jsonResponse(
          "Saved document and incremented revision",
          documentSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await updateFeatureDocument(
          scope(c),
          c.req.valid("param").documentId,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "deleteFeatureDocument",
      path: "/{id}/documents/{documentId}",
      tags,
      summary: "Delete a Feature document",
      middleware: [...removeDocument],
      request: { params: documentParams },
      responses: {
        200: jsonResponse("Deleted document", documentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await deleteFeatureDocument(scope(c), c.req.valid("param").documentId),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listFeatureIssues",
      path: "/{id}/issues",
      tags,
      summary: "List a Feature's compact Task/Bug work",
      description:
        "Workflow-ordered, project-scoped and bounded. Includes completed work. milestoneId=none selects work without a milestone; archived defaults to exclude. Group totals use all matching work before pagination.",
      middleware: [...read],
      request: { params: featureParams, query: issuesQuery },
      responses: {
        200: jsonResponse(
          "Compact Issues and whole-query workflow totals",
          issuePageSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(await readFeatureIssues(scope(c), c.req.valid("query")), 200),
  );
export default feature;
