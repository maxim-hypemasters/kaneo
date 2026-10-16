import { describe, expect, it } from "vite-plus/test";
import { groupedRowTasks } from "./grouped-row-tasks";

const ids = (tasks: { id: string }[]) => tasks.map((task) => task.id);

describe("groupedRowTasks", () => {
  it("drops features whose tasks are on the chart, keeping order", () => {
    expect(
      ids(
        groupedRowTasks([
          { id: "plain", type: "task", featureId: null },
          { id: "checkout", type: "feature", featureId: null },
          { id: "pay", type: "task", featureId: "checkout" },
          { id: "legacy" },
        ]),
      ),
    ).toEqual(["plain", "pay", "legacy"]);
  });

  it("keeps a feature none of whose tasks are on the chart", () => {
    expect(
      ids(
        groupedRowTasks([
          { id: "checkout", type: "feature", featureId: null },
          { id: "other", type: "task", featureId: "search" },
        ]),
      ),
    ).toEqual(["checkout", "other"]);
  });

  it("keeps the row of a feature it's asked to keep, tasks or not", () => {
    expect(
      ids(
        groupedRowTasks(
          [
            { id: "checkout", type: "feature", featureId: null },
            { id: "pay", type: "task", featureId: "checkout" },
            { id: "search", type: "feature", featureId: null },
            { id: "query", type: "task", featureId: "search" },
          ],
          new Set(["checkout", "pay"]),
        ),
      ),
    ).toEqual(["checkout", "pay", "query"]);
  });

  it("ignores a feature id on another feature", () => {
    expect(
      ids(
        groupedRowTasks([
          { id: "a", type: "feature", featureId: "b" },
          { id: "b", type: "feature", featureId: null },
        ]),
      ),
    ).toEqual(["a", "b"]);
  });
});
