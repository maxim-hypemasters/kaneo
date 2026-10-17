import { describe, expect, it } from "vite-plus/test";
import type Task from "@/types/task";
import { getFeatureIndex } from "./feature-index";

const task = (id: string, values: Partial<Task> = {}) =>
  ({ id, title: id, type: "task", featureId: null, ...values }) as Task;

describe("getFeatureIndex", () => {
  it("finds features and their tasks anywhere on the board", () => {
    const board = {
      columns: [
        {
          tasks: [
            task("checkout", { type: "feature" }),
            task("cart", { featureId: "checkout" }),
          ],
        },
      ],
      plannedTasks: [task("form", { featureId: "checkout" })],
      archivedTasks: [task("search", { type: "feature" })],
    };

    const index = getFeatureIndex(board);

    expect([...index.features.keys()]).toEqual(["checkout", "search"]);
    expect(index.tasksByFeature.get("checkout")?.map((t) => t.id)).toEqual([
      "cart",
      "form",
    ]);
    // Same snapshot, same index.
    expect(getFeatureIndex(board)).toBe(index);
  });

  it("is empty without a board", () => {
    expect(getFeatureIndex(undefined).features.size).toBe(0);
  });
});
