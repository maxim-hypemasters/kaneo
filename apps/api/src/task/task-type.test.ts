import { describe, expect, it } from "vite-plus/test";
import {
  createTaskBody,
  importTasksBody,
  listTasksQuery,
  updateTypeBody,
} from "./schema";
import { taskTypeSchema } from "./response";
import { TASK_TYPES } from "./task-type";

describe("task item types", () => {
  it.each(TASK_TYPES)(
    "accepts %s across creation, lists and imports; only leaves convert",
    (type) => {
      expect(
        createTaskBody.parse({
          title: "Item",
          description: "",
          priority: "low",
          status: "to-do",
          type,
        }).type,
      ).toBe(type);
      if (type === "feature")
        expect(updateTypeBody.safeParse({ type }).success).toBe(false);
      else expect(updateTypeBody.parse({ type }).type).toBe(type);
      expect(listTasksQuery.parse({ type }).type).toBe(type);
      expect(
        importTasksBody.parse({
          tasks: [{ title: "Item", status: "to-do", type }],
        }).tasks[0]?.type,
      ).toBe(type);
      expect(taskTypeSchema.parse(type)).toBe(type);
    },
  );

  it("rejects unknown types and keeps old import bodies valid", () => {
    expect(updateTypeBody.safeParse({ type: "defect" }).success).toBe(false);
    expect(listTasksQuery.safeParse({ type: "Bug" }).success).toBe(false);
    expect(
      importTasksBody.parse({
        tasks: [{ title: "Legacy item", status: "to-do" }],
      }).tasks[0]?.type,
    ).toBeUndefined();
  });
});
