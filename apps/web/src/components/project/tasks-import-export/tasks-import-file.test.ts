import { describe, expect, it } from "vite-plus/test";
import { isJsonFile, parseTasksImport } from "./tasks-import-file";

describe("parseTasksImport", () => {
  it("returns the tasks array from an export file", () => {
    expect(
      parseTasksImport(JSON.stringify({ tasks: [{ title: "Ship" }] })),
    ).toEqual({ tasks: [{ title: "Ship" }] });
  });

  it("returns null when the file has no tasks array", () => {
    expect(parseTasksImport(JSON.stringify({ tasks: "nope" }))).toBeNull();
    expect(parseTasksImport(JSON.stringify([]))).toBeNull();
    expect(parseTasksImport("null")).toBeNull();
  });

  it("preserves hierarchy metadata in a versioned file", () => {
    const document = {
      version: 2,
      tasks: [
        { key: "f", title: "Feature", type: "feature" },
        {
          key: "b",
          title: "Bug",
          type: "bug",
          featureKey: "f",
          milestoneKey: "m",
        },
      ],
      milestones: [
        { key: "m", featureKey: "f", title: "Release", position: 0 },
      ],
    };
    expect(parseTasksImport(JSON.stringify(document))).toEqual(document);
  });
  it("rejects unsupported versions and missing milestone definitions", () => {
    expect(
      parseTasksImport(JSON.stringify({ version: 3, tasks: [] })),
    ).toBeNull();
    expect(
      parseTasksImport(JSON.stringify({ version: 2, tasks: [] })),
    ).toBeNull();
  });
  it("throws on content that is not JSON", () => {
    expect(() => parseTasksImport("not json")).toThrow();
  });
});

describe("isJsonFile", () => {
  it("accepts JSON by type or extension", () => {
    expect(isJsonFile({ name: "a.txt", type: "application/json" })).toBe(true);
    expect(isJsonFile({ name: "tasks.json", type: "" })).toBe(true);
    expect(isJsonFile({ name: "tasks.csv", type: "text/csv" })).toBe(false);
  });
});
