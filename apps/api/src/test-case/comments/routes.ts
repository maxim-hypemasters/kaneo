import { requireEntitlement } from "../../billing/require-entitlement-middleware";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { finalizedAssetSchema, imageUploadSchema } from "../../task/response";
import { normalizeApiServerUrl } from "../../utils/openapi-spec";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { testCaseScope } from "../request-scope";
import { testCaseParams } from "../schema";
import { createCommentUpload, finalizeCommentUpload } from "./comment-upload";
import { createTestCaseComment } from "./create-test-case-comment";
import { deleteTestCaseComment } from "./delete-test-case-comment";
import { listTestCaseComments } from "./list-test-case-comments";
import {
  commentParams,
  commentUploadBody,
  deletedTestCaseCommentSchema,
  finalizeCommentUploadBody,
  testCaseCommentBody,
  testCaseCommentListSchema,
  testCaseCommentSchema,
} from "./schema";
import { updateTestCaseComment } from "./update-test-case-comment";

const read = [
  workspaceAccess.fromTestCase("id"),
  requireWorkspacePermission({ test_case: ["read"] }),
] as const;
// Commenting is part of working on a test case, as it is on a task.
const write = [
  workspaceAccess.fromTestCase("id"),
  requireWorkspacePermission({ test_case: ["update"] }),
  requireEntitlement,
] as const;

const errors = {
  400: errorResponse("Invalid comment"),
  402: errorResponse("Workspace plan expired"),
  403: errorResponse("No access or missing permission"),
  404: errorResponse("Test case not found"),
  409: errorResponse("Project changed; refresh and retry"),
};
const ownErrors = {
  ...errors,
  404: errorResponse(
    "Test case or comment not found, or the comment is someone else's",
  ),
};
const uploadErrors = {
  ...errors,
  400: errorResponse("Invalid upload, or the file is too large"),
};
const tags = ["Test cases"];
const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

const commentRoutes = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "listTestCaseComments",
      path: "/{id}/comments",
      tags,
      summary: "List a test case's comments",
      description: "Oldest first.",
      middleware: [...read],
      request: { params: testCaseParams },
      responses: {
        200: jsonResponse("Comments", testCaseCommentListSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await listTestCaseComments(testCaseScope(c), c.req.valid("param").id),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "createTestCaseComment",
      path: "/{id}/comments",
      tags,
      summary: "Comment on a test case",
      description:
        "Needs test_case:update. Members mentioned in the comment who may read test cases are notified.",
      middleware: [...write],
      request: { params: testCaseParams, body: json(testCaseCommentBody) },
      responses: {
        200: jsonResponse("Created comment", testCaseCommentSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await createTestCaseComment(
          testCaseScope(c),
          c.req.valid("param").id,
          c.req.valid("json").content,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "patch",
      operationId: "updateTestCaseComment",
      path: "/{id}/comments/{commentId}",
      tags,
      summary: "Edit your comment on a test case",
      description:
        "Only the author can edit a comment. Uploads the new text no longer references are deleted. Mentions added by an edit are not notified.",
      middleware: [...write],
      request: { params: commentParams, body: json(testCaseCommentBody) },
      responses: {
        200: jsonResponse("Updated comment", testCaseCommentSchema),
        ...ownErrors,
      },
    }),
    async (c) => {
      const { id, commentId } = c.req.valid("param");
      return c.json(
        await updateTestCaseComment(
          testCaseScope(c),
          id,
          commentId,
          c.req.valid("json").content,
        ),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "deleteTestCaseComment",
      path: "/{id}/comments/{commentId}",
      tags,
      summary: "Delete your comment on a test case",
      description:
        "Only the author can delete a comment. Its uploads are deleted with it.",
      middleware: [...write],
      request: { params: commentParams },
      responses: {
        200: jsonResponse("Deleted comment", deletedTestCaseCommentSchema),
        ...ownErrors,
      },
    }),
    async (c) => {
      const { id, commentId } = c.req.valid("param");
      return c.json(
        await deleteTestCaseComment(testCaseScope(c), id, commentId),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "createTestCaseCommentUpload",
      path: "/{id}/comment-upload",
      tags,
      summary: "Create a comment upload URL",
      description:
        "Get a presigned URL for a file used in a comment on this test case. PUT the bytes to it, then call the finalize route.",
      middleware: [...write],
      request: { params: testCaseParams, body: json(commentUploadBody) },
      responses: {
        200: jsonResponse("The presigned upload", imageUploadSchema),
        ...uploadErrors,
        503: errorResponse("Uploads are not configured on this instance"),
      },
    }),
    async (c) =>
      c.json(
        await createCommentUpload(
          testCaseScope(c),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "finalizeTestCaseCommentUpload",
      path: "/{id}/comment-upload/finalize",
      tags,
      summary: "Finalize a comment upload",
      description:
        "Record an uploaded file as a private asset of the test case and return the URL to reference it by in a comment.",
      middleware: [...write],
      request: {
        params: testCaseParams,
        body: json(finalizeCommentUploadBody),
      },
      responses: {
        200: jsonResponse("The stored asset", finalizedAssetSchema),
        ...uploadErrors,
        400: errorResponse(
          "Invalid upload, or the key does not belong to this test case",
        ),
      },
    }),
    async (c) => {
      const id = await finalizeCommentUpload(
        testCaseScope(c),
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      const api = normalizeApiServerUrl(
        process.env.KANEO_API_URL || new URL(c.req.url).origin,
      );
      return c.json({ id, url: `${api}/asset/${id}` }, 200);
    },
  );

export default commentRoutes;
