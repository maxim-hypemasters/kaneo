import type { ToolClient } from "@kaneo/mcp/tools";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import {
  ASSISTANT_TOOL_CATALOG,
  DOCUMENT_FIELDS,
  EXCLUDED_TOOLS,
  fieldPathTokens,
} from "./assistant-tool-catalog";
import { createAssistantTools } from "./assistant-tools";
import { registryToolMetadata } from "./collect-registry-tools";

type JsonSchema = Record<string, unknown>;

const registry = registryToolMetadata();
const catalogNames = Object.keys(ASSISTANT_TOOL_CATALOG);
const isReadOnly = (name: string) =>
  registry.get(name)?.annotations?.readOnlyHint === true;
const inputSchema = (name: string) =>
  z.toJSONSchema(registry.get(name)?.schema ?? z.object({}), {
    io: "input",
    unrepresentable: "any",
  }) as JsonSchema;

// Follows a field path through properties, array items and union branches.
function schemaHasPath(node: unknown, tokens: string[]): boolean {
  if (typeof node !== "object" || node === null) return false;
  const schema = node as JsonSchema;
  const [head, ...rest] = tokens;
  if (head === undefined) return true;
  const branches = (schema.anyOf ?? schema.oneOf ?? []) as unknown[];
  if (branches.some((branch) => schemaHasPath(branch, tokens))) return true;
  if (head === "[]") return schemaHasPath(schema.items, rest);
  const properties = (schema.properties ?? {}) as JsonSchema;
  return head in properties && schemaHasPath(properties[head], rest);
}

// Minimal valid arguments built from a tool's input JSON schema.
function sampleValue(node: JsonSchema): unknown {
  const branches = (node.anyOf ?? node.oneOf) as JsonSchema[] | undefined;
  if (branches)
    return sampleValue(
      branches.find((branch) => branch.type !== "null") ?? branches[0] ?? {},
    );
  if (Array.isArray(node.enum)) return node.enum[0];
  switch (node.type) {
    case "string":
      if (node.format === "date") return "2026-01-02";
      if (node.format === "date-time") return "2026-01-02T03:04:05Z";
      if (node.format === "uri") return "https://example.com";
      return "x";
    case "integer":
    case "number":
      return Math.max(1, Number(node.minimum ?? 1));
    case "boolean":
      return false;
    case "array":
      return [];
    default: {
      const properties = (node.properties ?? {}) as Record<string, JsonSchema>;
      const required = (node.required ?? []) as string[];
      return Object.fromEntries(
        required.map((key) => [key, sampleValue(properties[key] ?? {})]),
      );
    }
  }
}

function recordingClient() {
  const requests: { path: string; method: string }[] = [];
  const client: ToolClient = {
    json: async <T>(path: string, init?: RequestInit) => {
      requests.push({ path, method: (init?.method ?? "GET").toUpperCase() });
      return {} as T;
    },
  };
  return { client, requests };
}

describe("assistant tool catalog", () => {
  it("classifies every registry tool exactly once", () => {
    for (const name of registry.keys()) {
      const places = [
        name in ASSISTANT_TOOL_CATALOG,
        name in EXCLUDED_TOOLS,
      ].filter(Boolean);
      expect(places, name).toHaveLength(1);
    }
    for (const name of [...catalogNames, ...Object.keys(EXCLUDED_TOOLS)])
      expect(registry.has(name), name).toBe(true);
  });

  it("never allows a destructive tool", () => {
    for (const name of catalogNames)
      expect(registry.get(name)?.annotations?.destructiveHint, name).not.toBe(
        true,
      );
  });

  it("gives every write, and only writes, the permissions it needs", () => {
    for (const name of catalogNames) {
      const { requires } = ASSISTANT_TOOL_CATALOG[name] ?? {};
      if (isReadOnly(name)) expect(requires, name).toBeUndefined();
      else expect(requires?.length, name).toBeGreaterThan(0);
    }
  });

  it("keeps the planned writes and drops the out-of-scope ones", () => {
    const allowedWrites = catalogNames.filter((name) => !isReadOnly(name));
    expect(allowedWrites).toEqual(
      expect.arrayContaining([
        "create_task",
        "update_task",
        "update_task_status",
        "update_task_assignee",
        "update_task_estimate",
        "update_task_due_date",
        "set_task_type",
        "set_task_feature",
        "set_task_milestone",
        "set_task_release",
        "create_milestone",
        "update_milestone",
        "create_release",
        "update_release",
        "create_task_comment",
        "create_label",
        "attach_label_to_task",
        "create_task_relation",
        "create_time_entry",
        "create_project_page",
        "update_project_page",
        "create_feature_document",
        "update_feature_document",
        "update_task_description",
        "post_feature_update",
        "set_task_custom_field_value",
        "create_task_external_link",
        "update_project_details",
        "create_project",
      ]),
    );
    for (const name of [
      "move_task",
      "duplicate_task",
      "move_unfinished_release_items",
      "reorder_milestones",
      "archive_feature",
      "update_project",
      "update_task_comment",
      "detach_label_from_task",
      "update_time_entry",
      "whoami",
      "list_workspaces",
      "list_notifications",
    ])
      expect(EXCLUDED_TOOLS[name], name).toBeTruthy();
  });

  it("pins, omits and gates only fields the schemas have", () => {
    for (const [name, entry] of Object.entries(ASSISTANT_TOOL_CATALOG)) {
      const shape = registry.get(name)?.schema.shape ?? {};
      for (const pin of entry.pin ?? [])
        expect(shape, name).toHaveProperty(pin);
      for (const path of [
        ...(entry.omit ?? []),
        ...(entry.serverSet ?? []),
        ...(entry.assignFields ?? []),
      ])
        expect(
          schemaHasPath(inputSchema(name), fieldPathTokens(path)),
          `${name} ${path}`,
        ).toBe(true);
    }
  });

  it("pins every allowed tool that takes a workspaceId", () => {
    for (const name of catalogNames)
      if ("workspaceId" in (registry.get(name)?.schema.shape ?? {}))
        expect(ASSISTANT_TOOL_CATALOG[name]?.pin, name).toContain(
          "workspaceId",
        );
  });

  it("names the body field of every document read", () => {
    const documentReads = catalogNames.filter(
      (name) => isReadOnly(name) && ASSISTANT_TOOL_CATALOG[name]?.document,
    );
    expect(Object.keys(DOCUMENT_FIELDS).sort()).toEqual(documentReads.sort());
  });

  it.each(["create_task", "update_task", "update_task_status"])(
    "%s refuses the archived and triage statuses",
    (name) => {
      const refuse = ASSISTANT_TOOL_CATALOG[name]?.refuse;
      expect(refuse?.({ status: "archived" })).toMatch(/archive/);
      expect(refuse?.({ status: " Archived " })).toMatch(/archive/);
      expect(refuse?.({ status: "triage" })).toMatch(/into Triage/);
      expect(refuse?.({ status: " TRIAGE " })).toMatch(/into Triage/);
      expect(refuse?.({ status: "in-progress" })).toBeNull();
      expect(refuse?.({ status: "triaged" })).toBeNull();
      expect(refuse?.({})).toBeNull();
    },
  );

  it("reads issue GET requests only", async () => {
    const { client, requests } = recordingClient();
    const tools = createAssistantTools({
      workspaceId: "ws-1",
      can: () => false,
      client,
      mode: "read",
    });
    const reads = catalogNames.filter(isReadOnly);
    expect(reads.length).toBeGreaterThan(30);

    for (const name of reads) {
      const before = requests.length;
      const prepared = tools.prepareArgs(
        name,
        JSON.stringify(sampleValue(inputSchema(name))),
      );
      if (!prepared.ok) throw new Error(`${name}: ${prepared.error}`);
      const result = await tools.lookup(name)?.run(prepared.args);
      expect(result?.isError, name).toBeFalsy();
      const made = requests.slice(before);
      expect(made.length, name).toBeGreaterThan(0);
      for (const request of made) expect(request.method, name).toBe("GET");
    }
  });

  it("sends the pinned workspace and the activity limit", async () => {
    const { client, requests } = recordingClient();
    const tools = createAssistantTools({
      workspaceId: "ws-1",
      can: () => false,
      client,
      mode: "read",
    });
    const run = async (name: string, args: Record<string, unknown>) => {
      const prepared = tools.prepareArgs(name, JSON.stringify(args));
      if (!prepared.ok) throw new Error(prepared.error);
      await tools.lookup(name)?.run(prepared.args);
      return requests.at(-1)?.path;
    };

    expect(await run("search", { q: "login", workspaceId: "ws-other" })).toBe(
      "/api/search?q=login&workspaceId=ws-1",
    );
    expect(await run("get_task_by_ticket_id", { ticketId: "KAN-1" })).toBe(
      "/api/task/by-ticket-id/KAN-1?workspaceId=ws-1",
    );
    expect(await run("list_task_activity", { taskId: "t1" })).toBe(
      "/api/activity/t1?limit=50",
    );
  });
});
