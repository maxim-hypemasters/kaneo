import { describe, expect, it } from "vite-plus/test";
import type Task from "@/types/task";
import { getReleaseIndex } from "./release-index";

const task = (id: string, values: Partial<Task> = {}) =>
  ({ id, title: id, status: "todo", releaseId: null, ...values }) as Task;

describe("getReleaseIndex", () => {
  it("groups non-archived items by release, in board order", () => {
    const board = {
      columns: [
        {
          tasks: [
            task("checkout", { type: "feature", releaseId: "2.4" }),
            task("cart", { releaseId: "2.4" }),
            task("loose"),
          ],
        },
        { tasks: [task("search", { status: "done", releaseId: "2.5" })] },
      ],
      plannedTasks: [task("form", { status: "planned", releaseId: "2.4" })],
      archivedTasks: [task("old", { status: "archived", releaseId: "2.4" })],
    };

    const index = getReleaseIndex(board);

    expect(index.get("2.4")?.map((item) => item.id)).toEqual([
      "checkout",
      "cart",
      "form",
    ]);
    expect(index.get("2.5")?.map((item) => item.id)).toEqual(["search"]);
    expect(index.size).toBe(2);
    // Same snapshot, same index.
    expect(getReleaseIndex(board)).toBe(index);
  });

  it("is empty without a board", () => {
    expect(getReleaseIndex(undefined).size).toBe(0);
    expect(getReleaseIndex(null).size).toBe(0);
  });
});
