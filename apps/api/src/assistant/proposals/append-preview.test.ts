import { describe, expect, it } from "vite-plus/test";
import { APPEND_CONTEXT_CHARS, appendPreview } from "./append-preview";

describe("appendPreview", () => {
  it("keeps a short text whole", () => {
    expect(appendPreview("Steps", "More")).toEqual({
      before: "Steps",
      after: "Steps\n\nMore",
    });
    // Appended as the write appends it.
    expect(appendPreview("# Notes\n\n", "  More  ").after).toBe(
      "# Notes\n\nMore",
    );
    expect(appendPreview("", "More").after).toBe("More");
  });

  it("keeps only the last lines of a long text, from a line break", () => {
    const line = "x".repeat(99);
    const current = Array.from({ length: 100 }, () => line).join("\n");
    const { before, after } = appendPreview(current, "Added");
    expect(before.length).toBeGreaterThanOrEqual(APPEND_CONTEXT_CHARS);
    expect(before.length).toBeLessThan(APPEND_CONTEXT_CHARS + 100);
    expect(before.startsWith(line)).toBe(true);
    expect(current.endsWith(before)).toBe(true);
    expect(after).toBe(`${before}\n\nAdded`);
  });

  it("keeps a long text without line breaks whole", () => {
    const current = "y".repeat(APPEND_CONTEXT_CHARS * 2);
    expect(appendPreview(current, "Added")).toEqual({
      before: current,
      after: `${current}\n\nAdded`,
    });
  });
});
