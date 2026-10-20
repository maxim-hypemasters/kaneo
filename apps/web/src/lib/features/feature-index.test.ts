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

  it("retains knowledge summaries when execution boards no longer contain Features", () => {
    const index = getFeatureIndex(
      { columns: [{ tasks: [task("child", { featureId: "feature" })] }] },
      [
        {
          id: "feature",
          title: "Knowledge",
          number: 1,
          projectId: "project",
          status: null,
          archivedAt: null,
        },
      ],
    );
    expect(index.features.get("feature")?.title).toBe("Knowledge");
    expect(index.features.get("feature")?.status).toBeNull();
    expect(index.tasksByFeature.get("feature")?.map((item) => item.id)).toEqual(
      ["child"],
    );
  });
  it("is empty without a board", () => {
    expect(getFeatureIndex(undefined).features.size).toBe(0);
  });
});
