import { describe, expect, it } from "vite-plus/test";
import type Task from "@/types/task";
import { countReleaseItems, liveBoard } from "./release-counts";

const task = (id: string, values: Partial<Task>) =>
  ({
    id,
    title: id,
    status: "to-do",
    projectId: "p",
    type: "task",
    releaseId: "r1",
    ...values,
  }) as Task;

const progress = {
  tasks: { total: 9, completed: 4 },
  features: { total: 2, completed: 1 },
  milestones: { total: 3, completed: 1 },
  unfinished: 6,
};

describe("countReleaseItems", () => {
  it("uses the API's progress without a board", () => {
    const counts = countReleaseItems([{ id: "r1", progress }], undefined);
    expect(counts.get("r1")).toEqual({
      tasks: 9,
      completedTasks: 4,
      features: 2,
      completedFeatures: 0,
      milestones: 3,
      completedMilestones: 1,
      unfinished: 6,
    });
  });

  it("keeps complete milestone aggregates authoritative when a task-only board is cached", () => {
    const board = {
      columns: [
        {
          slug: "to-do",
          isFinal: false,
          tasks: [task("a", {}), task("f", { type: "feature" })],
        },
        {
          slug: "done",
          isFinal: true,
          tasks: [
            task("b", { status: "done" }),
            task("o", { releaseId: "r2" }),
          ],
        },
      ],
      plannedTasks: [task("p", { status: "planned" })],
      archivedTasks: [
        task("x", { status: "archived" }),
        task("y", { status: "archived", releaseId: null }),
      ],
    };
    const counts = countReleaseItems(
      [
        { id: "r1", progress },
        { id: "r2", progress },
        { id: "r3", progress },
      ],
      board,
    );
    expect(counts.get("r1")).toEqual({
      tasks: 9,
      completedTasks: 4,
      features: 2,
      completedFeatures: 0,
      milestones: 3,
      completedMilestones: 1,
      unfinished: 6,
    });
    expect(counts.get("r2")).toEqual(counts.get("r1"));
    expect(counts.get("r3")).toEqual(counts.get("r1"));
  });
});

describe("liveBoard", () => {
  const board = { columns: [] };

  it("takes a current board at least as recent as the list", () => {
    expect(
      liveBoard({ data: board, dataUpdatedAt: 20, isInvalidated: false }, 10),
    ).toBe(board);
    expect(
      liveBoard({ data: board, dataUpdatedAt: 10, isInvalidated: false }, 10),
    ).toBe(board);
  });

  it("skips a missing, invalidated or older board", () => {
    expect(liveBoard(undefined, 0)).toBeUndefined();
    expect(
      liveBoard({ data: undefined, dataUpdatedAt: 0, isInvalidated: false }, 0),
    ).toBeUndefined();
    expect(
      liveBoard({ data: board, dataUpdatedAt: 20, isInvalidated: true }, 10),
    ).toBeUndefined();
    expect(
      liveBoard({ data: board, dataUpdatedAt: 5, isInvalidated: false }, 10),
    ).toBeUndefined();
  });
});
