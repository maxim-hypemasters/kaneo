import { describe, expect, it } from "vite-plus/test";
import { milestoneProgress } from "./progress";

const columns = [
  { id: "c", slug: "done", position: 2, isFinal: true },
  { id: "b", slug: "doing", position: 1, isFinal: false },
  { id: "a", slug: "todo", position: 0, isFinal: false },
];
describe("milestone progress", () => {
  it("includes archived, backlog and unknown work in total but excludes them from started", () => {
    expect(
      milestoneProgress(
        [
          { status: "todo", count: 2 },
          { status: "doing", count: 3 },
          { status: "done", count: 4 },
          { status: "archived", count: 5 },
          { status: "planned", count: 6 },
          { status: "removed", count: 7 },
        ],
        columns,
      ),
    ).toEqual({ total: 27, started: 7, completed: 4 });
  });
  it("uses position then id to identify the first nonfinal column", () => {
    const equal = columns.map((column) => ({ ...column, position: 0 }));
    expect(
      milestoneProgress(
        [
          { status: "doing", count: 3 },
          { status: "todo", count: 2 },
        ],
        equal,
      ),
    ).toEqual({ total: 5, started: 3, completed: 0 });
    expect(
      milestoneProgress(
        [
          { status: "doing", count: 3 },
          { status: "todo", count: 2 },
        ],
        columns.map((column) => ({
          ...column,
          position: column.slug === "doing" ? -1 : column.position,
        })),
      ),
    ).toEqual({ total: 5, started: 2, completed: 0 });
  });
  it("derives completion from current Done flags and returns zero for empty milestones", () => {
    expect(milestoneProgress([], columns)).toEqual({
      total: 0,
      started: 0,
      completed: 0,
    });
    expect(
      milestoneProgress(
        [{ status: "doing", count: 2 }],
        columns.map((column) => ({
          ...column,
          isFinal: column.slug === "doing",
        })),
      ),
    ).toEqual({ total: 2, started: 2, completed: 2 });
  });
});
