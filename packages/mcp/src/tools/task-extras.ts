import { z } from "zod";
import { appendMarkdown } from "./append-to-document.js";
import type { ToolAnnotations, ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";
import { summarizeTaskDescriptionWrite } from "./write-summary.js";

const id = z.string().trim().min(1);
const read = { readOnlyHint: true } satisfies ToolAnnotations;
const write = { readOnlyHint: false } satisfies ToolAnnotations;
const MAX_DESCRIPTION_CHARACTERS = 1_000_000;
// The API serves 32,768-character pages, so appends read up to about 2M.
const MAX_DESCRIPTION_PAGES = 64;

type DescriptionPage = {
  content: string;
  version: string;
  nextOffset: number | null;
};

function descriptionPagePath(taskId: string, offset: number, version?: string) {
  const query = new URLSearchParams({ offset: String(offset) });
  if (version !== undefined) query.set("version", version);
  return `/api/task/${encodeURIComponent(taskId)}/description?${query}`;
}

// Pins every page to the first page's version, so a concurrent edit fails
// with 409 instead of mixing two descriptions.
async function readFullDescription(client: ToolClient, taskId: string) {
  let content = "";
  let offset = 0;
  let version: string | undefined;
  for (let pages = 0; pages < MAX_DESCRIPTION_PAGES; pages++) {
    const page = await client.json<DescriptionPage>(
      descriptionPagePath(taskId, offset, version),
      { method: "GET" },
    );
    content += page.content;
    if (page.nextOffset === null) return content;
    offset = page.nextOffset;
    version = page.version;
  }
  throw new Error("The description is too long to append to");
}

async function appendBody(
  client: ToolClient,
  taskId: string,
  addition: string,
) {
  const current = await readFullDescription(client, taskId);
  return {
    description: appendMarkdown(current, addition),
    expectedDescription: current,
  };
}

const updateDescriptionSchema = z
  .strictObject({
    taskId: id,
    description: z
      .string()
      .max(MAX_DESCRIPTION_CHARACTERS)
      .optional()
      .describe("New full description (Markdown). Replaces everything."),
    appendMarkdown: z
      .string()
      .max(100_000)
      .regex(/\S/, "appendMarkdown must not be blank")
      .optional()
      .describe("Markdown added as a new block after the current description."),
    expectedDescription: z
      .string()
      .max(MAX_DESCRIPTION_CHARACTERS)
      .optional()
      .describe(
        "Required with description: the complete current description you read.",
      ),
  })
  .superRefine((value, ctx) => {
    const replacing = value.description !== undefined;
    if (replacing === (value.appendMarkdown !== undefined))
      ctx.addIssue({
        code: "custom",
        message: "Provide either description or appendMarkdown",
      });
    else if (replacing && value.expectedDescription === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["expectedDescription"],
        message:
          "A full replace requires expectedDescription; read the whole description with get_task_description first",
      });
    else if (!replacing && value.expectedDescription !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["expectedDescription"],
        message: "expectedDescription is only used with description",
      });
  });

export function registerTaskExtraTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  const taskPath = (path: string, taskId: string) =>
    `${path}/${encodeURIComponent(taskId)}`;

  registerTool(
    server,
    "get_task_description",
    {
      description:
        "Read a task's description in pages of 32,768 characters. truncated is false only when content is the whole description, and only then is totalLength set. While nextOffset is not null, call again with offset=nextOffset and the returned version; a version conflict means it changed, so restart at offset 0.",
      inputSchema: z.object({
        taskId: id,
        offset: z.number().int().min(0).max(2_000_000_000).optional(),
        version: z
          .string()
          .regex(/^[0-9]{1,10}$/)
          .optional(),
      }),
      annotations: read,
    },
    async ({ taskId, offset = 0, version }) => {
      const page = await client.json<DescriptionPage>(
        descriptionPagePath(taskId, offset, version),
        { method: "GET" },
      );
      const whole = offset === 0 && page.nextOffset === null;
      return {
        taskId,
        offset,
        content: page.content,
        version: page.version,
        nextOffset: page.nextOffset,
        truncated: !whole,
        // Offsets and lengths count Unicode code points, like the API.
        totalLength: whole ? Array.from(page.content).length : null,
      };
    },
  );
  registerTool(
    server,
    "update_task_description",
    {
      description:
        "Replace a task's description, or append Markdown to it. A full replace needs expectedDescription, the complete current text, and fails if it changed. Uploads the edit removes are kept. Returns the task without its description, plus descriptionLength.",
      inputSchema: updateDescriptionSchema,
      annotations: write,
    },
    async ({ taskId, appendMarkdown: addition, ...replace }) =>
      summarizeTaskDescriptionWrite(
        await client.json(taskPath("/api/task/description", taskId), {
          method: "PUT",
          body: JSON.stringify({
            ...(addition === undefined
              ? replace
              : await appendBody(client, taskId, addition)),
            keepRemovedAssets: true,
          }),
        }),
      ),
  );
  registerTool(
    server,
    "get_task_custom_fields",
    {
      description:
        "Get a task's custom field values with each field's name, type and options.",
      inputSchema: z.object({ taskId: id }),
      annotations: read,
    },
    ({ taskId }) =>
      client.json(taskPath("/api/custom-field/task", taskId), {
        method: "GET",
      }),
  );
  registerTool(
    server,
    "set_task_custom_field_value",
    {
      description:
        "Set one custom field on a task. value is text: a number, 'true' or 'false', a date as YYYY-MM-DD, one dropdown option, or a JSON array of multiselect options. An empty string clears an optional field. Field ids come from list_custom_fields.",
      inputSchema: z.strictObject({
        taskId: id,
        fieldId: id,
        value: z.string().max(10_000),
      }),
      annotations: write,
    },
    (args) =>
      client.json("/api/custom-field/value", {
        method: "PUT",
        body: JSON.stringify(args),
      }),
  );
  registerTool(
    server,
    "list_task_external_links",
    {
      description:
        "List a task's resource links: manual links and links from connected integrations such as GitHub or Gitea issues.",
      inputSchema: z.object({ taskId: id }),
      annotations: read,
    },
    ({ taskId }) =>
      client.json(taskPath("/api/external-link/task", taskId), {
        method: "GET",
      }),
  );
  registerTool(
    server,
    "create_task_external_link",
    {
      description: "Add a manual resource link to a task.",
      inputSchema: z.strictObject({
        taskId: id,
        url: z.url({ protocol: /^https?$/ }).describe("An HTTP or HTTPS URL"),
        title: z.string().trim().max(200).optional(),
      }),
      annotations: write,
    },
    ({ taskId, ...link }) =>
      client.json(taskPath("/api/external-link/task", taskId), {
        method: "POST",
        body: JSON.stringify(link),
      }),
  );
}
