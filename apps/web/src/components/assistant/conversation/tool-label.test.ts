import en from "@i18n/en-US.json";
import { describe, expect, it } from "vite-plus/test";
// Runtime-free: the catalog module only has type imports.
import { ASSISTANT_TOOL_CATALOG } from "../../../../../api/src/assistant/tools/assistant-tool-catalog";
import { READ_TOOL_NAMES, toolLabelKey } from "./tool-label";

const toolCopy = (
  en.workspace as { assistant: { tools: Record<string, string> } }
).assistant.tools;

// The API classifies tools by the registry's readOnlyHint. Every read in the
// catalog is a list_/get_ tool or search, and every write starts with a verb
// that changes something; a new tool that fits neither fails here.
const isRead = (name: string) => /^(list|get)_/.test(name) || name === "search";
const isWrite = (name: string) =>
  /^(create|update|set|attach|post)_/.test(name);

describe("tool labels", () => {
  it("cover exactly the catalog's read tools", () => {
    const catalog = Object.keys(ASSISTANT_TOOL_CATALOG);
    for (const name of catalog) {
      expect(isRead(name) !== isWrite(name), name).toBe(true);
    }
    expect([...READ_TOOL_NAMES].sort()).toEqual(catalog.filter(isRead).sort());
  });

  it.each(READ_TOOL_NAMES)("has English copy for %s", (name) => {
    const key = toolLabelKey(name);
    expect(key).not.toBe("workspace:assistant.tools.fallback");
    const copy = toolCopy[key.split(".").at(-1) ?? ""];
    expect(copy).toBeTruthy();
  });

  it("falls back for unknown and write tools", () => {
    for (const name of [null, "create_task", "unknown_tool", "constructor"]) {
      expect(toolLabelKey(name)).toBe("workspace:assistant.tools.fallback");
    }
    expect(toolCopy.fallback).toBeTruthy();
  });
});
