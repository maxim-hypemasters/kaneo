import { describe, expect, it } from "vite-plus/test";
import { parseRecord, toProgressEvent } from "./parse-stream-json";

describe("parseRecord", () => {
  it("reads JSONL records and skips anything else", () => {
    expect(parseRecord('{"type": "text", "text": "Hi"}')).toEqual({
      type: "text",
      text: "Hi",
    });
    expect(parseRecord("⚠ install out of sync")).toBeNull();
    expect(parseRecord("{broken")).toBeNull();
    expect(parseRecord('{"no": "type"}')).toBeNull();
  });
});

describe("toProgressEvent", () => {
  it("summarises tool calls by their main argument", () => {
    expect(
      toProgressEvent({
        type: "tool_use",
        name: "terminal",
        input: { command: "pnpm test\n--watch=false" },
      }),
    ).toEqual({ kind: "tool", message: "terminal: pnpm test" });
    expect(
      toProgressEvent({
        type: "tool_use",
        name: "read_file",
        input: { path: "a.ts" },
      }),
    ).toEqual({ kind: "tool", message: "read_file: a.ts" });
    expect(toProgressEvent({ type: "tool_use", name: "todo_list" })).toBeNull();
  });

  it("reports failed tools and ignores the rest", () => {
    expect(
      toProgressEvent({
        type: "tool_result",
        name: "terminal",
        output: "Error: 2 tests failed\nmore",
        is_error: true,
      }),
    ).toEqual({
      kind: "log",
      message: "terminal failed: Error: 2 tests failed",
    });
    expect(
      toProgressEvent({ type: "tool_result", name: "terminal", output: "ok" }),
    ).toBeNull();
    expect(toProgressEvent({ type: "text", text: "thinking" })).toBeNull();
  });
});
