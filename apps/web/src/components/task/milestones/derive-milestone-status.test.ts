import { describe, expect, it } from "vite-plus/test";
import { deriveMilestoneStatus } from "./derive-milestone-status";

const workflow = [
  { id: "a", slug: "queue", position: 0, isFinal: false },
  { id: "b", slug: "building", position: 1, isFinal: false },
  { id: "c", slug: "review", position: 2, isFinal: false },
  { id: "d", slug: "shipped", position: 3, isFinal: true },
];
const task = (status: string | null, type = "task") => ({ type, status });

describe("derived milestone status", () => {
  it("starts empty and archived-only milestones in To Do", () => {
    expect(deriveMilestoneStatus([], workflow)).toBe("to-do");
    expect(
      deriveMilestoneStatus(
        [task("archived"), task("building", "feature")],
        workflow,
      ),
    ).toBe("to-do");
  });
  it("uses Done flags for all linked Tasks and Bugs, including custom slugs", () => {
    expect(
      deriveMilestoneStatus(
        [task("shipped"), task("shipped", "bug"), task("archived")],
        workflow,
      ),
    ).toBe("done");
  });
  it("counts completed work as started when unfinished work remains", () => {
    expect(
      deriveMilestoneStatus([task("shipped"), task("queue", "bug")], workflow),
    ).toBe("in-progress");
  });
  it("uses any active nonfinal column after the first to indicate In Progress", () => {
    expect(
      deriveMilestoneStatus(
        [task("review", "bug"), task("queue"), task("shipped")],
        workflow,
      ),
    ).toBe("in-progress");
  });
  it("treats backlog, unknown and missing statuses as unstarted", () => {
    expect(
      deriveMilestoneStatus(
        [task("planned"), task("deleted-column"), task(null)],
        workflow,
      ),
    ).toBe("to-do");
    expect(deriveMilestoneStatus([task("building")], [])).toBe("to-do");
    expect(
      deriveMilestoneStatus(
        [task("backlog")],
        [
          ...workflow,
          { id: "e", slug: "backlog", position: 4, isFinal: false },
        ],
      ),
    ).toBe("to-do");
    expect(
      deriveMilestoneStatus(
        [task("shipped"), task("planned"), task("deleted-column")],
        workflow,
      ),
    ).toBe("in-progress");
  });
  it("follows position then ID ordering and workflow Done flag changes", () => {
    const tied = [
      { id: "b", slug: "queue", position: 0, isFinal: false },
      { id: "a", slug: "building", position: 0, isFinal: false },
    ];
    expect(deriveMilestoneStatus([task("queue")], tied)).toBe("in-progress");
    expect(deriveMilestoneStatus([task("building")], tied)).toBe("to-do");
    expect(
      deriveMilestoneStatus(
        [task("building")],
        tied.map((column) => ({
          ...column,
          isFinal: column.slug === "building",
        })),
      ),
    ).toBe("done");
  });
});
