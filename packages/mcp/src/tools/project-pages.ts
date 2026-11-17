import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";
import { sliceDocumentBody } from "./slice-document-body.js";
import {
  type CurrentDocument,
  updateDocumentBody,
} from "./update-document-body.js";
import { summarizeDocumentWrite } from "./write-summary.js";

const MAX_BODY = 1_000_000;

export function registerProjectPageTools(
  server: ToolRegistrar,
  client: ToolClient,
) {
  const id = z.string().trim().min(1);
  const title = z.string().trim().min(1).max(255);
  const pagePath = (pageId: string) =>
    `/api/project-document/${encodeURIComponent(pageId)}`;
  const projectPath = (projectId: string) =>
    `/api/project-document/project/${encodeURIComponent(projectId)}`;

  registerTool(
    server,
    "list_project_pages",
    {
      description:
        "List a project's pages (id, parentId, position, title; no bodies) and the documents of its active Features.",
      inputSchema: z.object({ projectId: id }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId }) => client.json(projectPath(projectId), { method: "GET" }),
  );

  registerTool(
    server,
    "get_project_page",
    {
      description:
        "Read a project page and its revision. The Markdown body comes in slices: while nextOffset is not null, call again with offset=nextOffset. truncated is false only when body is the whole page.",
      inputSchema: z.object({
        pageId: id,
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Body character to start at. Default 0."),
        maxChars: z
          .number()
          .int()
          .min(1)
          .max(30_000)
          .optional()
          .describe("Body characters to return. Default 12000."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ pageId, offset, maxChars }) => {
      const page = await client.json<Record<string, unknown>>(
        pagePath(pageId),
        { method: "GET" },
      );
      const body = typeof page.body === "string" ? page.body : "";
      return { ...page, ...sliceDocumentBody(body, offset, maxChars) };
    },
  );

  registerTool(
    server,
    "create_project_page",
    {
      description:
        "Create a project page with a Markdown body. Pass parentId to nest it as the last child of another page. Returns the page's metadata and totalLength, not its body.",
      inputSchema: z.strictObject({
        projectId: id,
        title,
        body: z.string().max(MAX_BODY).default(""),
        parentId: id.optional().describe("Parent page. Omit for top level."),
      }),
      annotations: { readOnlyHint: false },
    },
    async ({ projectId, ...page }) =>
      summarizeDocumentWrite(
        await client.json(projectPath(projectId), {
          method: "POST",
          body: JSON.stringify(page),
        }),
      ),
  );

  registerTool(
    server,
    "update_project_page",
    {
      description:
        "Rename a project page, append Markdown to it, or replace its whole body. Replacing needs expectedRevision from reading the full body; a stale revision fails with DOCUMENT_CONFLICT. Removed attachments are kept. Returns the page's metadata and totalLength, not its body.",
      inputSchema: z.strictObject({
        pageId: id,
        title: title.optional(),
        body: z
          .string()
          .max(MAX_BODY)
          .optional()
          .describe("New full Markdown body. Requires expectedRevision."),
        appendMarkdown: z
          .string()
          .trim()
          .min(1)
          .max(MAX_BODY)
          .optional()
          .describe("Markdown added after the current body."),
        expectedRevision: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "Revision the edit is based on. Required with body; otherwise the current revision.",
          ),
      }),
      annotations: { readOnlyHint: false },
    },
    async ({ pageId, ...edit }) => {
      const path = pagePath(pageId);
      const options = { noun: "page", maxBody: MAX_BODY };
      let update = updateDocumentBody(edit, null, options);
      if (update.status === "needs-current") {
        const current = await client.json<CurrentDocument>(path, {
          method: "GET",
        });
        update = updateDocumentBody(edit, current, options);
      }
      if (update.status === "invalid") throw new Error(update.error);
      return summarizeDocumentWrite(
        await client.json(path, {
          method: "PUT",
          body: JSON.stringify(update.put),
        }),
      );
    },
  );
}
