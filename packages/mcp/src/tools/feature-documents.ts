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

export function registerFeatureDocumentTools(
  server: ToolRegistrar,
  client: ToolClient,
) {
  const id = z.string().trim().min(1);
  const featureId = id.describe("Feature task ID");
  const title = z.string().trim().min(1).max(255);
  const documentsPath = (feature: string) =>
    `/api/feature/${encodeURIComponent(feature)}/documents`;
  const documentPath = (feature: string, documentId: string) =>
    `${documentsPath(feature)}/${encodeURIComponent(documentId)}`;

  registerTool(
    server,
    "list_feature_documents",
    {
      description:
        "List a Feature's documents (no bodies), most recently updated first, in pages of 50 by default.",
      inputSchema: z.object({
        featureId,
        search: z.string().trim().max(255).optional().describe("Title filter"),
        page: z.number().int().min(1).max(1_000_000).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ featureId: feature, ...options }) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(options))
        if (value !== undefined) query.set(key, String(value));
      return client.json(
        `${documentsPath(feature)}${query.size ? `?${query}` : ""}`,
        { method: "GET" },
      );
    },
  );

  registerTool(
    server,
    "get_feature_document",
    {
      description:
        "Read a Feature document and its revision. The Markdown body comes in slices: while nextOffset is not null, call again with offset=nextOffset. truncated is false only when body is the whole document.",
      inputSchema: z.object({
        featureId,
        documentId: id,
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
    async ({ featureId: feature, documentId, offset, maxChars }) => {
      const document = await client.json<Record<string, unknown>>(
        documentPath(feature, documentId),
        { method: "GET" },
      );
      const body = typeof document.body === "string" ? document.body : "";
      return { ...document, ...sliceDocumentBody(body, offset, maxChars) };
    },
  );

  registerTool(
    server,
    "create_feature_document",
    {
      description:
        "Create a Feature document with a Markdown body. Returns the document's metadata and totalLength, not its body.",
      inputSchema: z.strictObject({
        featureId,
        title,
        body: z.string().max(MAX_BODY).default(""),
      }),
      annotations: { readOnlyHint: false },
    },
    async ({ featureId: feature, ...document }) =>
      summarizeDocumentWrite(
        await client.json(documentsPath(feature), {
          method: "POST",
          body: JSON.stringify(document),
        }),
      ),
  );

  registerTool(
    server,
    "update_feature_document",
    {
      description:
        "Rename a Feature document, append Markdown to it, or replace its whole body. Replacing needs expectedRevision from reading the full body; a stale revision fails with DOCUMENT_CONFLICT. Removed attachments are kept. Returns the document's metadata and totalLength, not its body.",
      inputSchema: z.strictObject({
        featureId,
        documentId: id,
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
    async ({ featureId: feature, documentId, ...edit }) => {
      const path = documentPath(feature, documentId);
      const options = { noun: "document", maxBody: MAX_BODY };
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
