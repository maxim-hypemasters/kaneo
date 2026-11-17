import type { ToolClient } from "@kaneo/mcp/tools";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { PermissionMap } from "../../utils/role-permissions";
import { DOCUMENT_RESULT_MAX_CHARS, TOOL_RESULT_MAX_CHARS } from "../constants";
import type { ToolDefinition } from "../openrouter/types";
import {
  ASSISTANT_TOOL_CATALOG,
  type CatalogEntry,
  DOCUMENT_FIELDS,
  fieldPathTokens,
} from "./assistant-tool-catalog";
import { collectRegistryTools } from "./collect-registry-tools";
import { buildToolDefinitions } from "./tool-definitions";

export type AssistantToolHandle = {
  name: string;
  entry: CatalogEntry;
  readOnly: boolean;
  /** Reads always; writes when the caller has one of the entry's `requires`. */
  permitted: boolean;
  /** Reads only: the body field that compaction keeps intact. */
  documentField: string | undefined;
  /** The compaction cap for this tool's results. */
  maxResultChars: number;
  /** Runs with prepared arguments. In read mode, writes are refused unsent. */
  run(args: Record<string, unknown>): Promise<CallToolResult>;
};

export type PreparedToolArgs =
  | { ok: true; args: Record<string, unknown>; argsJson: string }
  | { ok: false; error: string };

export type AssistantTools = {
  /** Every read, and the writes the caller is permitted. */
  offered(): ToolDefinition[];
  lookup(name: string): AssistantToolHandle | null;
  /**
   * Checks the model's arguments against the catalog, then validates them.
   * `fill` adds what the server sets right before validation.
   */
  prepareArgs(
    name: string,
    rawArgs: string,
    fill?: (args: Record<string, unknown>) => Record<string, unknown>,
  ): PreparedToolArgs;
};

type Args = Record<string, unknown>;

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Whether `value` holds the field at `tokens` ("[]" means any array item).
function hasField(value: unknown, tokens: string[]): boolean {
  const [head, ...rest] = tokens;
  if (head === undefined) return false;
  if (head === "[]")
    return Array.isArray(value) && value.some((item) => hasField(item, rest));
  if (!isRecord(value) || !Object.hasOwn(value, head)) return false;
  return rest.length === 0 || hasField(value[head], rest);
}

const writeRefused: CallToolResult = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        error: "Changes run only after the user approves them.",
      }),
    },
  ],
  isError: true,
};

/**
 * The assistant's view of the registry for one caller: the allowlisted tools,
 * filtered by the caller's permissions and pinned to one workspace.
 */
export function createAssistantTools(opts: {
  workspaceId: string;
  can: (permissions: PermissionMap) => boolean;
  client: ToolClient;
  mode: "read" | "write";
}): AssistantTools {
  const registry = collectRegistryTools(opts.client);
  const canAssign = opts.can({ task: ["assign"] });

  const handles = new Map<string, AssistantToolHandle>();
  const schemas = new Map<string, z.ZodObject>();
  // Catalog order, skipping any tool this registry build lacks.
  for (const [name, entry] of Object.entries(ASSISTANT_TOOL_CATALOG)) {
    const tool = registry.get(name);
    if (!tool) continue;
    const readOnly = tool.annotations?.readOnlyHint === true;
    schemas.set(name, tool.schema);
    handles.set(name, {
      name,
      entry,
      readOnly,
      permitted:
        readOnly ||
        (entry.requires?.some((permissions) => opts.can(permissions)) ?? false),
      documentField: readOnly ? DOCUMENT_FIELDS[name] : undefined,
      maxResultChars:
        readOnly && entry.document
          ? DOCUMENT_RESULT_MAX_CHARS
          : TOOL_RESULT_MAX_CHARS,
      run: (args) =>
        !readOnly && opts.mode === "read"
          ? Promise.resolve(writeRefused)
          : tool.run(args),
    });
  }

  const fail = (error: string): PreparedToolArgs => ({ ok: false, error });

  return {
    offered() {
      const names = [...handles.values()]
        .filter((handle) => handle.permitted)
        .map((handle) => handle.name);
      return buildToolDefinitions(names, { canAssign });
    },

    lookup: (name) => handles.get(name) ?? null,

    prepareArgs(name, rawArgs, fill) {
      const handle = handles.get(name);
      const schema = schemas.get(name);
      if (!handle || !schema) return fail(`There is no tool named "${name}".`);
      const { entry } = handle;

      let parsed: unknown;
      try {
        parsed = rawArgs.trim() === "" ? {} : JSON.parse(rawArgs);
      } catch {
        return fail("The arguments are not valid JSON. Send one JSON object.");
      }
      if (!isRecord(parsed))
        return fail("The arguments must be a JSON object.");

      for (const field of entry.omit ?? [])
        if (Object.hasOwn(parsed, field))
          return fail(`${name} does not take "${field}"; leave it out.`);
      if (!canAssign)
        for (const path of entry.assignFields ?? [])
          if (hasField(parsed, fieldPathTokens(path)))
            return fail(
              `This user can't assign people: leave out "${path}" and try again.`,
            );

      const args: Args = { ...parsed };
      for (const key of entry.serverSet ?? []) delete args[key];
      for (const [key, value] of Object.entries(entry.defaults ?? {}))
        if (args[key] === undefined) args[key] = value;
      for (const key of entry.pin ?? []) args[key] = opts.workspaceId;

      const refusal = entry.refuse?.(args);
      if (refusal) return fail(refusal);

      const result = schema.safeParse(fill ? fill(args) : args);
      if (!result.success) return fail(z.prettifyError(result.error));
      const prepared = result.data as Args;
      return { ok: true, args: prepared, argsJson: JSON.stringify(prepared) };
    },
  };
}
