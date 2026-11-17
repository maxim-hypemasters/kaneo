import { describe, expect, it } from "vite-plus/test";
import { appendMarkdown } from "./append-to-document.js";

describe("appendMarkdown", () => {
  it("adds the addition as a new block", () => {
    expect(appendMarkdown("# Notes\n\nFirst.\n\n", "  - Second\n")).toBe(
      "# Notes\n\nFirst.\n\n- Second",
    );
  });

  it("returns only the addition when the body is blank", () => {
    expect(appendMarkdown(" \n", "\nHello\n")).toBe("Hello");
  });

  it("keeps the body when the addition is blank", () => {
    expect(appendMarkdown("Body\n", "  \n")).toBe("Body\n");
  });
});
