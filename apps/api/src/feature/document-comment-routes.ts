import {
  commentReadErrors,
  commentRouteDocs,
  commentWriteErrors,
} from "../document-comment/comment-route-docs";
import { createDocumentComment } from "../document-comment/create-document-comment";
import { deleteDocumentComment } from "../document-comment/delete-document-comment";
import { listDocumentComments } from "../document-comment/list-document-comments";
import { replyToDocumentComment } from "../document-comment/reply-to-document-comment";
import {
  createDocumentCommentBody,
  deletedDocumentCommentSchema,
  documentCommentResolutionBody,
  documentCommentThreadListSchema,
  documentCommentThreadSchema,
  featureCommentParams,
  replyToDocumentCommentBody,
  updateDocumentCommentBody,
} from "../document-comment/schema";
import { setDocumentCommentResolution } from "../document-comment/set-document-comment-resolution";
import type { CommentTarget } from "../document-comment/target";
import { updateDocumentComment } from "../document-comment/update-document-comment";
import { apiRouter, createRoute, jsonResponse } from "../openapi";
import { read, write } from "./route-middleware";
import { documentParams } from "./schema";

const tags = ["Features"];
const docs = commentRouteDocs("Feature document", "feature");
const errors = commentWriteErrors;
const target = (c: {
  req: { param: (key: string) => string | undefined };
  get: (key: "userId" | "authorizedProjectId" | "workspaceId") => string;
}): CommentTarget => ({
  kind: "feature",
  featureId: c.req.param("id")!,
  documentId: c.req.param("documentId")!,
  projectId: c.get("authorizedProjectId"),
  workspaceId: c.get("workspaceId"),
  userId: c.get("userId"),
});
const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

const documentCommentRoutes = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "listFeatureDocumentComments",
      path: "/{id}/documents/{documentId}/comments",
      tags,
      ...docs.list,
      middleware: [...read],
      request: { params: documentParams },
      responses: {
        200: jsonResponse(
          "Comment threads, oldest first",
          documentCommentThreadListSchema,
        ),
        ...commentReadErrors,
      },
    }),
    async (c) => c.json(await listDocumentComments(target(c)), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "createFeatureDocumentComment",
      path: "/{id}/documents/{documentId}/comments",
      tags,
      ...docs.create,
      middleware: [...write],
      request: {
        params: documentParams,
        body: json(createDocumentCommentBody),
      },
      responses: {
        200: jsonResponse("New thread", documentCommentThreadSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(await createDocumentComment(target(c), c.req.valid("json")), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "replyToFeatureDocumentComment",
      path: "/{id}/documents/{documentId}/comments/{commentId}/replies",
      tags,
      ...docs.reply,
      middleware: [...write],
      request: {
        params: featureCommentParams,
        body: json(replyToDocumentCommentBody),
      },
      responses: {
        200: jsonResponse(
          "Thread with the new reply",
          documentCommentThreadSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await replyToDocumentComment(
          target(c),
          c.req.valid("param").commentId,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "updateFeatureDocumentComment",
      path: "/{id}/documents/{documentId}/comments/{commentId}",
      tags,
      ...docs.update,
      middleware: [...write],
      request: {
        params: featureCommentParams,
        body: json(updateDocumentCommentBody),
      },
      responses: {
        200: jsonResponse(
          "Thread with the edited comment",
          documentCommentThreadSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await updateDocumentComment(
          target(c),
          c.req.valid("param").commentId,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "deleteFeatureDocumentComment",
      path: "/{id}/documents/{documentId}/comments/{commentId}",
      tags,
      ...docs.remove,
      middleware: [...write],
      request: { params: featureCommentParams },
      responses: {
        200: jsonResponse("Deleted comment", deletedDocumentCommentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await deleteDocumentComment(target(c), c.req.valid("param").commentId),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "setFeatureDocumentCommentResolution",
      path: "/{id}/documents/{documentId}/comments/{commentId}/resolution",
      tags,
      ...docs.resolution,
      middleware: [...write],
      request: {
        params: featureCommentParams,
        body: json(documentCommentResolutionBody),
      },
      responses: {
        200: jsonResponse(
          "Thread in its new state",
          documentCommentThreadSchema,
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await setDocumentCommentResolution(
          target(c),
          c.req.valid("param").commentId,
          c.req.valid("json").resolved,
        ),
        200,
      ),
  );

export default documentCommentRoutes;
