import { describe, expect, it } from "vite-plus/test";
import { taskStage } from "./task-stage";

describe("taskStage", () => {
  it("finds Triage by its status", () => {
    expect(taskStage("triage", { todoStatus: "to-do" })).toBe("triage");
  });

  it("finds To Do by the project's To Do column", () => {
    expect(taskStage("to-do", { todoStatus: "to-do" })).toBe("todo");
    expect(taskStage("ready", { todoStatus: "ready" })).toBe("todo");
  });

  it("puts every other column, and a missing status, elsewhere", () => {
    expect(taskStage("in-progress", { todoStatus: "to-do" })).toBe("other");
    expect(taskStage("planned", { todoStatus: "to-do" })).toBe("other");
    expect(taskStage(null, { todoStatus: "to-do" })).toBe("other");
    expect(taskStage(null, { todoStatus: null })).toBe("other");
    expect(taskStage("to-do", { todoStatus: null })).toBe("other");
  });
});
