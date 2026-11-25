import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

const id = z.string().trim().min(1);
const content = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .describe(
    'Markdown. <kaneo-mention id="userId"></kaneo-mention> mentions a member',
  );

export function registerTestCaseCommentTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  const thread = (testCaseId: string) =>
    `/api/test-case/${encodeURIComponent(testCaseId)}/comments`;
  const item = (testCaseId: string, commentId: string) =>
    `${thread(testCaseId)}/${encodeURIComponent(commentId)}`;

  registerTool(
    server,
    "list_test_case_comments",
    {
      description: "List the comments on a test case, oldest first.",
      inputSchema: z.object({ testCaseId: id }),
      annotations: { readOnlyHint: true },
    },
    ({ testCaseId }) => client.json(thread(testCaseId), { method: "GET" }),
  );
  registerTool(
    server,
    "create_test_case_comment",
    {
      description:
        "Add a comment to a test case. Mentioned members who can read test cases are notified.",
      inputSchema: z.strictObject({ testCaseId: id, content }),
      annotations: { readOnlyHint: false },
    },
    ({ testCaseId, ...body }) =>
      client.json(thread(testCaseId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
  );
  registerTool(
    server,
    "update_test_case_comment",
    {
      description:
        "Edit one of your comments on a test case. Files the new text no longer references are deleted.",
      inputSchema: z.strictObject({ testCaseId: id, commentId: id, content }),
      annotations: { readOnlyHint: false },
    },
    ({ testCaseId, commentId, ...body }) =>
      client.json(item(testCaseId, commentId), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  );
  registerTool(
    server,
    "delete_test_case_comment",
    {
      description:
        "Delete one of your comments from a test case, with the files attached to it.",
      inputSchema: z.object({ testCaseId: id, commentId: id }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    ({ testCaseId, commentId }) =>
      client.json(item(testCaseId, commentId), { method: "DELETE" }),
  );
}
