import en from "@i18n/en-US.json";
import { describe, expect, it } from "vite-plus/test";
// Runtime-free API modules: only type imports besides their own code.
import { HIDDEN_KEYS } from "../../../../../api/src/assistant/proposals/proposal-fields";
import { ASSISTANT_TOOL_CATALOG } from "../../../../../api/src/assistant/tools/assistant-tool-catalog";
import { READ_TOOL_NAMES } from "../conversation/tool-label";
import {
  ALL_TITLE_KEYS,
  FIELD_FALLBACK_KEY,
  fieldLabelKey,
  proposalTitleKey,
  TITLE_FALLBACK_KEY,
  WRITE_TOOL_NAMES,
} from "./proposal-copy";

type RegisteredTool = { inputSchema: { shape: Record<string, unknown> } };
type Registry = {
  registerTools: (
    registrar: {
      registerTool: (name: string, config: RegisteredTool) => void;
    },
    options: { client: { json: () => Promise<unknown> } },
  ) => void;
};

// The shared tool registry, loaded from its source when the test runs. The
// specifier isn't a literal, so the web's type check doesn't compile the
// MCP package with the web's compiler options.
const REGISTRY_SOURCE = new URL(
  "../../../../../../packages/mcp/src/tools/register.ts",
  import.meta.url,
).pathname;

async function writeToolArguments(): Promise<Map<string, string[]>> {
  const { registerTools } = (await import(
    /* @vite-ignore */ REGISTRY_SOURCE
  )) as Registry;
  const shapes = new Map<string, string[]>();
  registerTools(
    {
      registerTool: (name, config) => {
        shapes.set(name, Object.keys(config.inputSchema.shape));
      },
    },
    { client: { json: () => Promise.reject(new Error("not run")) } },
  );
  return shapes;
}

const copyAt = (key: string): unknown =>
  key
    .replace(/^workspace:/, "")
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en.workspace,
    );

describe("proposal copy", () => {
  it("covers exactly the catalog's write tools", () => {
    const reads = new Set<string>(READ_TOOL_NAMES);
    const writes = Object.keys(ASSISTANT_TOOL_CATALOG).filter(
      (name) => !reads.has(name),
    );
    expect([...WRITE_TOOL_NAMES].sort()).toEqual(writes.sort());
  });

  it("has an English title naming the target for every write tool", () => {
    for (const name of WRITE_TOOL_NAMES) {
      const key = proposalTitleKey(name, { target: "Mobile", fields: [] });
      expect(key, name).not.toBe(TITLE_FALLBACK_KEY);
    }
    for (const key of ALL_TITLE_KEYS) {
      const copy = copyAt(key);
      expect(typeof copy, key).toBe("string");
      if (key !== TITLE_FALLBACK_KEY) expect(copy, key).toContain("{{target}}");
    }
  });

  it("titles a new task by its type", () => {
    const fields = (type: string) => [
      { key: "type", kind: "text" as const, value: type },
    ];
    expect(
      proposalTitleKey("create_task", { target: "Mobile", fields: [] }),
    ).toBe("workspace:assistant.proposal.title.createTask");
    expect(
      proposalTitleKey("create_task", {
        target: "Mobile",
        fields: fields("bug"),
      }),
    ).toBe("workspace:assistant.proposal.title.createBug");
    expect(
      proposalTitleKey("create_task", {
        target: "Mobile",
        fields: fields("feature"),
      }),
    ).toBe("workspace:assistant.proposal.title.createFeature");
    expect(
      proposalTitleKey("create_task", {
        target: "Mobile",
        fields: fields("toString"),
      }),
    ).toBe("workspace:assistant.proposal.title.createTask");
  });

  it("falls back for unknown tools and cards without a target", () => {
    for (const name of [null, "delete_task", "get_task", "constructor"]) {
      expect(proposalTitleKey(name, { target: "Mobile", fields: [] })).toBe(
        TITLE_FALLBACK_KEY,
      );
    }
    expect(proposalTitleKey("create_task", { target: null, fields: [] })).toBe(
      TITLE_FALLBACK_KEY,
    );
    expect(proposalTitleKey("create_task", null)).toBe(TITLE_FALLBACK_KEY);
  });

  it("labels every argument a write tool's card can list", async () => {
    const shapes = await writeToolArguments();
    for (const name of WRITE_TOOL_NAMES) {
      const entry = ASSISTANT_TOOL_CATALOG[name];
      const keys = shapes.get(name);
      expect(keys, name).toBeDefined();
      const unlisted = new Set<string>([
        ...HIDDEN_KEYS,
        ...(entry?.pin ?? []),
        ...(entry?.omit ?? []),
      ]);
      for (const key of keys ?? []) {
        if (unlisted.has(key)) continue;
        const labelKey = fieldLabelKey(key);
        expect(labelKey, `${name}.${key}`).not.toBe(FIELD_FALLBACK_KEY);
        expect(typeof copyAt(labelKey), labelKey).toBe("string");
      }
    }
  });

  it("falls back for unknown fields", () => {
    for (const key of ["unknown", "constructor", "__proto__"]) {
      expect(fieldLabelKey(key)).toBe(FIELD_FALLBACK_KEY);
    }
    expect(typeof copyAt(FIELD_FALLBACK_KEY)).toBe("string");
  });
});
