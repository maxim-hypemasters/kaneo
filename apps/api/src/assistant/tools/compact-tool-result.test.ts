import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vite-plus/test";
import { LIST_STRING_MAX_CHARS } from "../constants";
import { compactToolResult, TRUNCATION_NOTE } from "./compact-tool-result";

const result = (data: unknown, isError = false): CallToolResult => ({
  content: [
    {
      type: "text",
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    },
  ],
  isError,
});

describe("compactToolResult", () => {
  it("minifies JSON and returns what it parsed", () => {
    const data = { id: "t1", tags: ["a", "b"], nested: { n: 1 } };
    expect(compactToolResult(result(data), { maxChars: 1_000 })).toEqual({
      content: JSON.stringify(data),
      isError: false,
      errorText: null,
      bodyComplete: false,
      parsed: data,
    });
  });

  it("strips email keys at any depth", () => {
    const data = {
      email: "a@example.com",
      members: [
        { name: "Ann", email: "ann@example.com", userEmail: "x@example.com" },
        { name: "Bo", owner_email: "bo@example.com", emailVerified: true },
      ],
      owner: { assigneeEmail: "c@example.com", name: "Cy" },
    };
    const { content } = compactToolResult(result(data), { maxChars: 1_000 });
    expect(JSON.parse(content)).toEqual({
      members: [{ name: "Ann" }, { name: "Bo", emailVerified: true }],
      owner: { name: "Cy" },
    });
  });

  it("cuts strings inside lists but not single values", () => {
    const long = "x".repeat(LIST_STRING_MAX_CHARS + 500);
    const data = {
      summary: long,
      tasks: [{ title: "A", description: long }],
      notes: [long],
    };
    const parsed = JSON.parse(
      compactToolResult(result(data), { maxChars: 100_000 }).content,
    );
    expect(parsed.summary).toBe(long);
    expect(parsed.tasks[0].description).toHaveLength(LIST_STRING_MAX_CHARS);
    expect(parsed.tasks[0].description.endsWith("…")).toBe(true);
    expect(parsed.notes[0]).toHaveLength(LIST_STRING_MAX_CHARS);
  });

  it("keeps the document field byte for byte when it fits", () => {
    const body = `# Plan\n\n${'Line with "quotes" and email: a@b.c\n'.repeat(80)}`;
    const data = { id: "p1", body, revision: 3, truncated: false };
    const compact = compactToolResult(result(data), {
      maxChars: 32_000,
      documentField: "body",
    });
    expect(compact.bodyComplete).toBe(true);
    expect(JSON.parse(compact.content).body).toBe(body);
  });

  it("counts a null description as complete and a missing one as not", () => {
    expect(
      compactToolResult(result({ id: "t1", description: null }), {
        maxChars: 1_000,
        documentField: "description",
      }).bodyComplete,
    ).toBe(true);
    expect(
      compactToolResult(result({ id: "t1" }), {
        maxChars: 1_000,
        documentField: "description",
      }).bodyComplete,
    ).toBe(false);
  });

  it("caps the whole result with a paging note", () => {
    const data = { items: Array.from({ length: 500 }, (_, i) => ({ id: i })) };
    const { content, bodyComplete } = compactToolResult(result(data), {
      maxChars: 1_000,
    });
    expect(content.length).toBeLessThanOrEqual(1_000);
    expect(content.endsWith(TRUNCATION_NOTE)).toBe(true);
    expect(content.startsWith('{"items":[{"id":0}')).toBe(true);
    expect(bodyComplete).toBe(false);
  });

  it("cuts an oversized document but keeps its metadata accurate", () => {
    const body = "a".repeat(5_000);
    const data = {
      id: "p1",
      revision: 7,
      body,
      offset: 100,
      totalLength: 5_100,
      truncated: false,
      nextOffset: null,
    };
    const compact = compactToolResult(result(data), {
      maxChars: 2_000,
      documentField: "body",
    });
    expect(compact.bodyComplete).toBe(false);
    expect(compact.content.length).toBeLessThanOrEqual(2_000);
    expect(compact.content.endsWith(TRUNCATION_NOTE)).toBe(true);

    const json = JSON.parse(compact.content.slice(0, -TRUNCATION_NOTE.length));
    expect(body.startsWith(json.body)).toBe(true);
    expect(json.body.length).toBeGreaterThan(1_500);
    expect(json).toMatchObject({
      id: "p1",
      revision: 7,
      truncated: true,
      nextOffset: 100 + json.body.length,
    });
  });

  it("never splits a surrogate pair when cutting", () => {
    const body = "😀".repeat(2_000);
    const compact = compactToolResult(
      result({ body, offset: 0, nextOffset: null }),
      { maxChars: 1_001, documentField: "body" },
    );
    const json = JSON.parse(compact.content.slice(0, -TRUNCATION_NOTE.length));
    expect(json.body.length % 2).toBe(0);
    expect(json.nextOffset).toBe(Array.from(json.body).length);

    const plain = compactToolResult(result(body), { maxChars: 101 });
    const kept = plain.content.slice(0, -TRUNCATION_NOTE.length);
    expect(kept.length % 2).toBe(0);
  });

  it("returns a short error text for failed calls", () => {
    const failed = compactToolResult(
      result({ error: "/api/task/t1: Task not found" }, true),
      { maxChars: 1_000, documentField: "description" },
    );
    expect(failed).toMatchObject({
      content: '{"error":"/api/task/t1: Task not found"}',
      isError: true,
      errorText: "/api/task/t1: Task not found",
      bodyComplete: false,
    });

    const long = compactToolResult(result({ error: "e".repeat(2_000) }, true), {
      maxChars: 16_000,
    });
    expect(long.errorText).toHaveLength(500);
    expect(long.content).toContain("e".repeat(2_000));
  });

  it("passes plain text through, capped", () => {
    expect(
      compactToolResult(result("Not JSON"), { maxChars: 100 }),
    ).toMatchObject({ content: "Not JSON", parsed: undefined });
    const capped = compactToolResult(result("y".repeat(500)), {
      maxChars: 100,
    });
    expect(capped.content).toBe(
      "y".repeat(100 - TRUNCATION_NOTE.length) + TRUNCATION_NOTE,
    );
    expect(compactToolResult({ content: [] }, { maxChars: 100 }).content).toBe(
      "(empty result)",
    );
  });
});
