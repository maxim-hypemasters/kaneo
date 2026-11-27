import { describe, expect, it } from "vite-plus/test";
import {
  resolveWorkflowColumns,
  type WorkflowColumn,
} from "./workflow-columns";

const column = (
  slug: string,
  position: number,
  isFinal = false,
): WorkflowColumn => ({
  id: `col-${slug}`,
  slug,
  name: slug.toUpperCase(),
  position,
  isFinal,
});

const DEFAULTS = [
  column("to-do", 0),
  column("in-progress", 1),
  column("in-review", 2),
  column("done", 3, true),
];

describe("resolveWorkflowColumns", () => {
  it("finds To Do and In Progress by slug", () => {
    expect(resolveWorkflowColumns(DEFAULTS)).toEqual({
      todo: { slug: "to-do", name: "TO-DO" },
      inProgress: { slug: "in-progress", name: "IN-PROGRESS" },
    });
  });

  it("orders by position, whatever the input order", () => {
    expect(
      resolveWorkflowColumns([...DEFAULTS].reverse()).inProgress?.slug,
    ).toBe("in-progress");
  });

  it("falls back to the first open column and the one after it", () => {
    expect(
      resolveWorkflowColumns([
        column("done", 0, true),
        column("inbox", 1),
        column("doing", 2),
        column("shipped", 3, true),
      ]),
    ).toEqual({
      todo: { slug: "inbox", name: "INBOX" },
      inProgress: { slug: "doing", name: "DOING" },
    });
  });

  it("skips a backlog column when picking In Progress", () => {
    expect(
      resolveWorkflowColumns([
        column("to-do", 0),
        column("backlog", 1),
        column("doing", 2),
      ]).inProgress?.slug,
    ).toBe("doing");
  });

  it("never picks the To Do column as In Progress", () => {
    expect(
      resolveWorkflowColumns([
        column("in-progress", 0),
        column("done", 1, true),
      ]),
    ).toEqual({
      todo: { slug: "in-progress", name: "IN-PROGRESS" },
      inProgress: null,
    });
  });

  it("ignores duplicated slugs and has nothing without open columns", () => {
    expect(
      resolveWorkflowColumns([
        column("to-do", 0),
        { ...column("to-do", 1), id: "col-to-do-2" },
        column("wip", 2),
      ]).todo?.slug,
    ).toBe("wip");
    expect(resolveWorkflowColumns([column("done", 0, true)])).toEqual({
      todo: null,
      inProgress: null,
    });
  });
});
