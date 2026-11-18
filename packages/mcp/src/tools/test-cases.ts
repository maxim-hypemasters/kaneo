import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

const id = z.string().trim().min(1);
const longText = z.string().max(10_000).nullable().optional();
// Mirrors TEST_CASE_STATUSES in apps/api/src/test-case/test-case-status.ts.
const status = z
  .enum(["not_run", "passed", "failed", "blocked"])
  .describe("Latest result of running the test case");
const fields = {
  description: longText.describe("Preconditions and context"),
  steps: longText,
  expectedResult: longText,
  status: status.optional(),
  milestoneId: id
    .nullable()
    .optional()
    .describe("Milestone in the same project it verifies; null unlinks"),
  bugId: id
    .nullable()
    .optional()
    .describe("Bug in the same project it verifies; null unlinks"),
};
const linkFilter = id
  .optional()
  .describe('Only test cases linked to this id, or "none" for unlinked ones');

export function registerTestCaseTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  const itemPath = (testCaseId: string) =>
    `/api/test-case/${encodeURIComponent(testCaseId)}`;

  const list = (scope: string, query: Record<string, string | number>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, String(value));
    return client.json(
      `/api/test-case/${scope}${params.size ? `?${params}` : ""}`,
      { method: "GET" },
    );
  };
  const page = {
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  };
  const rows =
    "Returns a page of rows without steps (use get_test_case for those) and counts per result status.";

  registerTool(
    server,
    "list_test_cases",
    {
      description: `List a project's test cases, oldest first, optionally filtered by title, status, milestone or bug. ${rows}`,
      inputSchema: z.object({
        projectId: id,
        search: z.string().trim().max(255).optional(),
        status: status.optional(),
        milestoneId: linkFilter,
        bugId: linkFilter,
        ...page,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, ...query }) =>
      list(`project/${encodeURIComponent(projectId)}`, query),
  );
  registerTool(
    server,
    "list_feature_test_cases",
    {
      description: `List the test cases linked to a Feature's milestones, in milestone order. ${rows}`,
      inputSchema: z.object({
        featureId: id,
        status: status.optional(),
        ...page,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ featureId, ...query }) =>
      list(`feature/${encodeURIComponent(featureId)}`, query),
  );
  registerTool(
    server,
    "list_release_test_cases",
    {
      description: `List a release's test cases: those whose milestone is planned for the release, and those whose Bug is in the release and not archived. ${rows}`,
      inputSchema: z.object({
        releaseId: id,
        status: status.optional(),
        ...page,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ releaseId, ...query }) =>
      list(`release/${encodeURIComponent(releaseId)}`, query),
  );
  registerTool(
    server,
    "get_test_case",
    {
      description:
        "Get a test case with its preconditions, steps, expected result, result status, and linked milestone and bug.",
      inputSchema: z.object({ testCaseId: id }),
      annotations: { readOnlyHint: true },
    },
    ({ testCaseId }) => client.json(itemPath(testCaseId), { method: "GET" }),
  );
  registerTool(
    server,
    "create_test_case",
    {
      description:
        "Create a test case in a project, optionally linked to one milestone and one Bug of that project. Status defaults to not_run.",
      inputSchema: z.strictObject({
        projectId: id,
        title: id.max(255),
        ...fields,
      }),
      annotations: { readOnlyHint: false },
    },
    ({ projectId, ...body }) =>
      client.json(`/api/test-case/project/${encodeURIComponent(projectId)}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  );
  registerTool(
    server,
    "update_test_case",
    {
      description:
        "Edit a test case or record a result. Omitted fields stay unchanged; null clears a text field or a link.",
      inputSchema: z
        .strictObject({
          testCaseId: id,
          title: id.max(255).optional(),
          ...fields,
        })
        .refine(
          ({ testCaseId: _, ...body }) =>
            Object.values(body).some((value) => value !== undefined),
          "Provide a field to update",
        ),
      annotations: { readOnlyHint: false },
    },
    ({ testCaseId, ...body }) =>
      client.json(itemPath(testCaseId), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  );
  registerTool(
    server,
    "delete_test_case",
    {
      description: "Delete a test case. Its milestone and bug are unaffected.",
      inputSchema: z.object({ testCaseId: id }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    ({ testCaseId }) => client.json(itemPath(testCaseId), { method: "DELETE" }),
  );
}
