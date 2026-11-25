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
  pageCommentParams,
  replyToDocumentCommentBody,
  updateDocumentCommentBody,
} from "../document-comment/schema";
import { setDocumentCommentResolution } from "../document-comment/set-document-comment-resolution";
import type { CommentTarget } from "../document-comment/target";
import { updateDocumentComment } from "../document-comment/update-document-comment";
import { apiRouter, createRoute, jsonResponse } from "../openapi";
import { read, write } from "./route-middleware";
import { documentParams } from "./schema";

const tags = ["Project documents"];
const docs = commentRouteDocs("project page", "document");
const errors = commentWriteErrors;
const target = (c: {
  req: { param: (key: string) => string | undefined };
  get: (key: "userId" | "authorizedProjectId" | "workspaceId") => string;
}): CommentTarget => ({
  kind: "page",
  documentId: c.req.param("id")!,
  projectId: c.get("authorizedProjectId"),
  workspaceId: c.get("workspaceId"),
  userId: c.get("userId"),
});
const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

const commentRoutes = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "listProjectDocumentComments",
      path: "/{id}/comments",
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
      operationId: "createProjectDocumentComment",
      path: "/{id}/comments",
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
      operationId: "replyToProjectDocumentComment",
      path: "/{id}/comments/{commentId}/replies",
      tags,
      ...docs.reply,
      middleware: [...write],
      request: {
        params: pageCommentParams,
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
      operationId: "updateProjectDocumentComment",
      path: "/{id}/comments/{commentId}",
      tags,
      ...docs.update,
      middleware: [...write],
      request: {
        params: pageCommentParams,
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
      operationId: "deleteProjectDocumentComment",
      path: "/{id}/comments/{commentId}",
      tags,
      ...docs.remove,
      middleware: [...write],
      request: { params: pageCommentParams },
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
      operationId: "setProjectDocumentCommentResolution",
      path: "/{id}/comments/{commentId}/resolution",
      tags,
      ...docs.resolution,
      middleware: [...write],
      request: {
        params: pageCommentParams,
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

export default commentRoutes;
