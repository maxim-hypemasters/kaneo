import type { Context, Next } from "hono";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { readJsonObjectBody } from "../utils/read-json-object-body";
import {
  requireWorkspacePermission,
  workspacePermissionChecker,
} from "../utils/require-workspace-permission";
import type { PermissionMap } from "../utils/role-permissions";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import commentRoutes from "./comments/routes";
import { createTestCase } from "./create-test-case";
import { deleteTestCase } from "./delete-test-case";
import { getTestCase } from "./get-test-case";
import { listFeatureTestCases } from "./list-feature-test-cases";
import { listProjectTestCases } from "./list-project-test-cases";
import { listReleaseTestCases } from "./list-release-test-cases";
import { testCaseScope } from "./request-scope";
import {
  createTestCaseBody,
  deletedTestCaseSchema,
  featureParams,
  projectParams,
  releaseParams,
  type TestCaseReadAccess,
  testCaseListQuery,
  testCaseListSchema,
  testCaseParams,
  testCaseSchema,
  updateTestCaseBody,
} from "./schema";
import { updateTestCase } from "./update-test-case";

// Linking needs read access on the target, so a test case can't be used to
// probe milestones or bugs the caller may not see.
async function requireLinkReadPermission(c: Context, next: Next) {
  const { milestoneId, bugId } = await readJsonObjectBody(c);
  const required: PermissionMap = {};
  if (typeof milestoneId === "string") required.milestone = ["read"];
  if (typeof bugId === "string") required.bug = ["read"];
  if (Object.keys(required).length === 0) return next();
  return requireWorkspacePermission(required)(c, next);
}

const projectRead = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ test_case: ["read"] }),
] as const;
const projectCreate = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ test_case: ["create"] }),
  requireEntitlement,
  requireLinkReadPermission,
] as const;
const featureRead = [
  workspaceAccess.fromTask("featureId"),
  requireWorkspacePermission({ test_case: ["read"], milestone: ["read"] }),
] as const;
const releaseRead = [
  workspaceAccess.fromRelease("releaseId"),
  requireWorkspacePermission({ test_case: ["read"] }),
] as const;
const read = [
  workspaceAccess.fromTestCase("id"),
  requireWorkspacePermission({ test_case: ["read"] }),
] as const;
const write = [
  workspaceAccess.fromTestCase("id"),
  requireWorkspacePermission({ test_case: ["update"] }),
  requireEntitlement,
  requireLinkReadPermission,
] as const;
const remove = [
  workspaceAccess.fromTestCase("id"),
  requireWorkspacePermission({ test_case: ["delete"] }),
  requireEntitlement,
] as const;

const errors = {
  400: errorResponse("Invalid test case, or the linked task isn't a bug"),
  402: errorResponse("Workspace plan expired"),
  403: errorResponse("No access or missing permission"),
  404: errorResponse("Project, test case, milestone or bug not found"),
  409: errorResponse("Project changed; refresh and retry"),
};
const tags = ["Test cases"];
const readAccess = async (c: Context): Promise<TestCaseReadAccess> => {
  const can = await workspacePermissionChecker(c);
  return {
    milestones: can({ milestone: ["read"] }),
    bugs: can({ bug: ["read"] }),
  };
};
const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});
const listDescription =
  "Rows leave out description, steps and expected result; read one test case for those. The linked milestone and bug are summarized only for callers with milestone:read and bug:read.";

const testCase = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "listProjectTestCases",
      path: "/project/{projectId}",
      tags,
      summary: "List a project's test cases",
      description: `Oldest first. ${listDescription}`,
      middleware: [...projectRead],
      request: { params: projectParams, query: testCaseListQuery },
      responses: {
        200: jsonResponse("Page of test cases", testCaseListSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await listProjectTestCases(
          testCaseScope(c),
          c.req.valid("query"),
          await readAccess(c),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "createTestCase",
      path: "/project/{projectId}",
      tags,
      summary: "Create a test case",
      middleware: [...projectCreate],
      request: { params: projectParams, body: json(createTestCaseBody) },
      responses: {
        200: jsonResponse("Created test case", testCaseSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await createTestCase(
          testCaseScope(c),
          c.req.valid("json"),
          await readAccess(c),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listFeatureTestCases",
      path: "/feature/{featureId}",
      tags,
      summary: "List the test cases of a Feature's milestones",
      description: `Test cases linked to any milestone of the Feature, in milestone order. Needs test_case:read and milestone:read. ${listDescription}`,
      middleware: [...featureRead],
      request: { params: featureParams, query: testCaseListQuery },
      responses: {
        200: jsonResponse("Page of test cases", testCaseListSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await listFeatureTestCases(
          testCaseScope(c),
          c.req.valid("param").featureId,
          c.req.valid("query"),
          await readAccess(c),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listReleaseTestCases",
      path: "/release/{releaseId}",
      tags,
      summary: "List a release's test cases",
      description: `Test cases whose milestone is planned for the release, or whose bug is in the release and not archived. Oldest first. ${listDescription}`,
      middleware: [...releaseRead],
      request: { params: releaseParams, query: testCaseListQuery },
      responses: {
        200: jsonResponse("Page of test cases", testCaseListSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await listReleaseTestCases(
          testCaseScope(c),
          c.req.valid("param").releaseId,
          c.req.valid("query"),
          await readAccess(c),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getTestCase",
      path: "/{id}",
      tags,
      summary: "Read a test case",
      middleware: [...read],
      request: { params: testCaseParams },
      responses: {
        200: jsonResponse("Test case", testCaseSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await getTestCase(
          testCaseScope(c),
          c.req.valid("param").id,
          await readAccess(c),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "patch",
      operationId: "updateTestCase",
      path: "/{id}",
      tags,
      summary: "Update a test case",
      description:
        "Changes only the fields sent. Send null to clear a text field or a link.",
      middleware: [...write],
      request: { params: testCaseParams, body: json(updateTestCaseBody) },
      responses: {
        200: jsonResponse("Updated test case", testCaseSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await updateTestCase(
          testCaseScope(c),
          c.req.valid("param").id,
          c.req.valid("json"),
          await readAccess(c),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "deleteTestCase",
      path: "/{id}",
      tags,
      summary: "Delete a test case",
      middleware: [...remove],
      request: { params: testCaseParams },
      responses: {
        200: jsonResponse("Deleted test case", deletedTestCaseSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await deleteTestCase(testCaseScope(c), c.req.valid("param").id),
        200,
      ),
  )
  .route("/", commentRoutes);

export default testCase;
