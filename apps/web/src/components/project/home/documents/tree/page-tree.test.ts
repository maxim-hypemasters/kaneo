import { describe, expect, it } from "vite-plus/test";
import {
  ancestorIds,
  descendantIds,
  flattenPageTree,
  type TreePage,
} from "./page-tree";

const page = (
  id: string,
  parentId: string | null,
  position: number,
): TreePage => ({ id, parentId, position, title: id });

const pages = [
  page("b", null, 1),
  page("a", null, 0),
  page("a2", "a", 1),
  page("a1", "a", 0),
  page("a1x", "a1", 0),
  page("orphan", "gone", 5),
];

const shape = (rows: ReturnType<typeof flattenPageTree>) =>
  rows.map((row) => `${"-".repeat(row.depth)}${row.page.id}`);

describe("flattenPageTree", () => {
  it("lists pages in order and shows only expanded children", () => {
    expect(shape(flattenPageTree(pages, new Set()))).toEqual([
      "a",
      "b",
      "orphan",
    ]);
    expect(shape(flattenPageTree(pages, new Set(["a", "a1"])))).toEqual([
      "a",
      "-a1",
      "--a1x",
      "-a2",
      "b",
      "orphan",
    ]);
  });

  it("marks pages with children and hides a skipped subtree", () => {
    const rows = flattenPageTree(pages, new Set(["a"]), "a1");
    expect(shape(rows)).toEqual(["a", "-a2", "b", "orphan"]);
    expect(rows[0]?.hasChildren).toBe(true);
    expect(rows[1]?.hasChildren).toBe(false);
  });
});

describe("descendantIds and ancestorIds", () => {
  it("finds every sub-page and every parent", () => {
    expect(descendantIds(pages, "a")).toEqual(new Set(["a1", "a2", "a1x"]));
    expect(descendantIds(pages, "b").size).toBe(0);
    expect(ancestorIds(pages, "a1x")).toEqual(["a1", "a"]);
    expect(ancestorIds(pages, "orphan")).toEqual([]);
  });
});
