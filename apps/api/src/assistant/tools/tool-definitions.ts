import { z } from "zod";
import type { ToolDefinition } from "../openrouter/types";
import {
  ASSISTANT_TOOL_CATALOG,
  fieldPathTokens,
} from "./assistant-tool-catalog";
import { registryToolMetadata } from "./collect-registry-tools";

type JsonSchema = Record<string, unknown>;

// Some providers reject these, and the long date regexes waste tokens. The
// handlers re-validate every argument with the zod schema anyway.
const DROPPED_KEYWORDS = new Set(["$schema", "pattern", "format"]);
// Keys of these maps are names, not keywords.
const SCHEMA_MAPS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
]);
// Literal values, never schemas.
const LITERALS = new Set(["enum", "const", "default", "examples"]);

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(cleanSchema);
  if (!isRecord(node)) return node;
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED_KEYWORDS.has(key)) continue;
    // z.number().int() emits the safe-integer bounds, which only cost tokens.
    if (
      (key === "maximum" && value === Number.MAX_SAFE_INTEGER) ||
      (key === "minimum" && value === Number.MIN_SAFE_INTEGER)
    )
      continue;
    if (LITERALS.has(key)) out[key] = value;
    else if (SCHEMA_MAPS.has(key) && isRecord(value))
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, sub]) => [name, cleanSchema(sub)]),
      );
    else out[key] = cleanSchema(value);
  }
  return out;
}

// Removes the property at `tokens` ("[]" steps into array items), through
// nullable and union branches.
function removeProperty(node: unknown, tokens: string[]): void {
  const [head, ...rest] = tokens;
  if (!isRecord(node) || head === undefined) return;
  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    const branches = node[keyword];
    if (Array.isArray(branches))
      for (const branch of branches) removeProperty(branch, tokens);
  }
  if (head === "[]") return removeProperty(node.items, rest);
  if (!isRecord(node.properties)) return;
  if (rest.length > 0) return removeProperty(node.properties[head], rest);
  delete node.properties[head];
  if (Array.isArray(node.required)) {
    const required = node.required.filter((name) => name !== head);
    if (required.length > 0) node.required = required;
    else delete node.required;
  }
}

function buildDefinition(name: string, canAssign: boolean): ToolDefinition {
  const tool = registryToolMetadata().get(name);
  const entry = ASSISTANT_TOOL_CATALOG[name];
  if (!tool || !entry) throw new Error(`Unknown assistant tool: ${name}`);
  const parameters = cleanSchema(
    z.toJSONSchema(tool.schema, { io: "input", unrepresentable: "any" }),
  ) as JsonSchema;
  const hidden = [
    ...(entry.pin ?? []),
    ...(entry.omit ?? []),
    ...(entry.serverSet ?? []),
    ...(canAssign ? [] : (entry.assignFields ?? [])),
  ];
  for (const path of hidden) removeProperty(parameters, fieldPathTokens(path));
  return {
    type: "function",
    function: { name, description: tool.description, parameters },
  };
}

const definitions = new Map<string, ToolDefinition>();

/**
 * Function definitions for the model, memoized per (name, canAssign). The
 * returned objects are shared: never mutate them.
 */
export function buildToolDefinitions(
  names: string[],
  ctx: { canAssign: boolean },
): ToolDefinition[] {
  return names.map((name) => {
    const key = `${name}:${ctx.canAssign}`;
    let definition = definitions.get(key);
    if (!definition) {
      definition = buildDefinition(name, ctx.canAssign);
      definitions.set(key, definition);
    }
    return definition;
  });
}
