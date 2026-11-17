import { describe, expect, it } from "vite-plus/test";
import {
  displayValue,
  fieldKind,
  formatDuration,
  proposalField,
} from "./proposal-fields";

describe("fieldKind", () => {
  it("classifies ids, Markdown, dates, lists and text", () => {
    expect(fieldKind("projectId", "p1")).toBe("ref");
    expect(fieldKind("userId", null)).toBe("ref");
    expect(fieldKind("fieldId", "f1")).toBe("ref");
    expect(fieldKind("description", "x")).toBe("markdown");
    expect(fieldKind("appendMarkdown", "x")).toBe("markdown");
    expect(fieldKind("note", "x")).toBe("markdown");
    expect(fieldKind("dueDate", "2026-11-20T00:00:00Z")).toBe("date");
    expect(fieldKind("codeFreezeDate", "2026-11-20")).toBe("date");
    expect(fieldKind("taskIds", ["a"])).toBe("list");
    expect(fieldKind("title", "Fix login")).toBe("text");
    expect(fieldKind("estimateSeconds", 3600)).toBe("text");
  });
});

describe("formatDuration", () => {
  it("shows hours and minutes", () => {
    expect(formatDuration(1800)).toBe("30m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("displayValue", () => {
  it("formats each kind of value", () => {
    expect(displayValue("title", "Fix login")).toBe("Fix login");
    expect(displayValue("userId", null)).toBe("");
    expect(displayValue("estimateSeconds", 7200)).toBe("2h");
    expect(displayValue("position", 3)).toBe("3");
    expect(displayValue("isPublic", false)).toBe("false");
    expect(displayValue("taskIds", ["a", "b"])).toBe("a\nb");
    expect(displayValue("items", [{ title: "One" }, { id: 2 }])).toBe(
      'One\n{"id":2}',
    );
    expect(displayValue("health", { a: 1 })).toBe('{"a":1}');
  });
});

describe("proposalField", () => {
  it("keeps `from` only when given", () => {
    expect(proposalField("title", "New", "New")).toEqual({
      key: "title",
      kind: "text",
      value: "New",
    });
    expect(proposalField("title", "New", "New", "Old")).toEqual({
      key: "title",
      kind: "text",
      value: "New",
      from: "Old",
    });
    expect(proposalField("userId", null, "", null)).toEqual({
      key: "userId",
      kind: "ref",
      value: "",
      from: null,
    });
  });
});
