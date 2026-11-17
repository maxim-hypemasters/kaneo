import { describe, expect, it } from "vite-plus/test";
import { ASSISTANT_TOOL_CATALOG } from "./assistant-tool-catalog";
import { buildToolDefinitions } from "./tool-definitions";

type JsonSchema = Record<string, unknown>;

const allNames = Object.keys(ASSISTANT_TOOL_CATALOG);

function parametersOf(name: string, canAssign = true) {
  const [definition] = buildToolDefinitions([name], { canAssign });
  return definition?.function.parameters as JsonSchema;
}

// Every keyword used anywhere in the schema, ignoring property names.
function keywords(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) for (const item of node) keywords(item, found);
  else if (typeof node === "object" && node !== null)
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      if (key === "properties")
        for (const sub of Object.values(value as JsonSchema))
          keywords(sub, found);
      else if (key !== "enum" && key !== "default") keywords(value, found);
    }
  return found;
}

const propertiesOf = (schema: JsonSchema | undefined) =>
  Object.keys((schema?.properties ?? {}) as JsonSchema);

describe("buildToolDefinitions", () => {
  it("converts every catalog tool to a function definition", () => {
    const definitions = buildToolDefinitions(allNames, { canAssign: true });
    expect(definitions.map((d) => d.function.name)).toEqual(allNames);
    for (const { type, function: fn } of definitions) {
      expect(type).toBe("function");
      expect(fn.description.length, fn.name).toBeGreaterThan(0);
      expect(fn.parameters.type, fn.name).toBe("object");
    }
  });

  it("drops $schema, pattern, format and the safe-integer bounds", () => {
    for (const { function: fn } of buildToolDefinitions(allNames, {
      canAssign: true,
    })) {
      const used = keywords(fn.parameters);
      for (const keyword of ["$schema", "pattern", "format"])
        expect(used.has(keyword), `${fn.name} ${keyword}`).toBe(false);
      expect(JSON.stringify(fn.parameters), fn.name).not.toContain(
        String(Number.MAX_SAFE_INTEGER),
      );
    }
    // The date fields keep their description.
    const startDate = (parametersOf("create_release").properties as JsonSchema)
      .startDate as JsonSchema;
    expect(startDate).toEqual({
      type: "string",
      description: "The first day of work",
    });
  });

  it("hides pinned, omitted and server-set fields", () => {
    for (const [name, entry] of Object.entries(ASSISTANT_TOOL_CATALOG)) {
      const parameters = parametersOf(name);
      for (const field of [
        ...(entry.pin ?? []),
        ...(entry.omit ?? []),
        ...(entry.serverSet ?? []),
      ]) {
        expect(propertiesOf(parameters), name).not.toContain(field);
        expect(parameters.required ?? [], name).not.toContain(field);
      }
    }
    expect(propertiesOf(parametersOf("update_task"))).toEqual(
      expect.arrayContaining(["taskId", "title", "status", "priority"]),
    );
    for (const [name, field] of [
      ["update_project_page", "expectedRevision"],
      ["update_feature_document", "expectedRevision"],
      ["update_task_description", "expectedDescription"],
    ] as const)
      expect(propertiesOf(parametersOf(name)), name).not.toContain(field);
    // The only required field was pinned, so `required` is gone.
    expect(parametersOf("list_workspace_activity")).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("hides assignee fields only without task:assign", () => {
    expect(propertiesOf(parametersOf("create_task", true))).toContain("userId");
    expect(propertiesOf(parametersOf("create_task", false))).not.toContain(
      "userId",
    );
    expect(propertiesOf(parametersOf("update_milestone", true))).toContain(
      "leadId",
    );
    expect(propertiesOf(parametersOf("update_milestone", false))).not.toContain(
      "leadId",
    );

    const milestoneDraft = (canAssign: boolean) => {
      const properties = parametersOf("create_task", canAssign)
        .properties as JsonSchema;
      const composition = properties.featureComposition as JsonSchema;
      const milestones = (composition.properties as JsonSchema)
        .milestones as JsonSchema;
      return milestones.items as JsonSchema;
    };
    expect(propertiesOf(milestoneDraft(true))).toContain("leadId");
    expect(propertiesOf(milestoneDraft(false))).not.toContain("leadId");
    expect(propertiesOf(milestoneDraft(false))).toContain("title");
  });

  it("makes defaulted fields optional", () => {
    expect(parametersOf("create_project_page").required).toEqual([
      "projectId",
      "title",
    ]);
  });

  it("memoizes per tool and assign capability", () => {
    const [first] = buildToolDefinitions(["create_task"], { canAssign: true });
    const [again] = buildToolDefinitions(["create_task"], { canAssign: true });
    const [other] = buildToolDefinitions(["create_task"], { canAssign: false });
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  it("rejects names outside the catalog", () => {
    expect(() =>
      buildToolDefinitions(["delete_task"], { canAssign: true }),
    ).toThrow(/Unknown assistant tool/);
  });
});
