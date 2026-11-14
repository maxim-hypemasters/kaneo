import { describe, expect, it } from "vite-plus/test";
import { flattenPageTree, type TreePage } from "./page-tree";
import { currentPlace, projectDrop } from "./project-drop";

const page = (
  id: string,
  parentId: string | null,
  position: number,
): TreePage => ({ id, parentId, position, title: id });

// a
//   a1
//   a2
// b
// c
const pages = [
  page("a", null, 0),
  page("a1", "a", 0),
  page("a2", "a", 1),
  page("b", null, 1),
  page("c", null, 2),
];
const rows = flattenPageTree(pages, new Set(["a"]));

describe("projectDrop", () => {
  it("reorders at the same depth", () => {
    expect(projectDrop(rows, "c", "b", 0)).toEqual({
      parentId: null,
      index: 1,
      depth: 0,
    });
  });

  it("nests under the row above when dragged right", () => {
    expect(projectDrop(rows, "c", "c", 1)).toEqual({
      parentId: "b",
      index: 0,
      depth: 1,
    });
  });

  it("never nests more than one level below the row above", () => {
    expect(projectDrop(rows, "c", "c", 5)?.depth).toBe(1);
  });

  it("joins siblings of the row above at its depth", () => {
    // b dropped between a1 and a2 stays inside a.
    expect(projectDrop(rows, "b", "a2", 0)).toEqual({
      parentId: "a",
      index: 1,
      depth: 1,
    });
  });

  it("moves a sub-page out when dragged left below the last child", () => {
    expect(projectDrop(rows, "a2", "a2", -1)).toEqual({
      parentId: null,
      index: 1,
      depth: 0,
    });
  });

  it("goes to the top when dropped first", () => {
    expect(projectDrop(rows, "b", "a", 3)).toEqual({
      parentId: null,
      index: 0,
      depth: 0,
    });
  });

  it("ignores unknown rows", () => {
    expect(projectDrop(rows, "x", "a", 0)).toBeNull();
  });
});

describe("currentPlace", () => {
  it("reports the parent and the index among siblings", () => {
    expect(currentPlace(rows, "a2")).toEqual({ parentId: "a", index: 1 });
    expect(currentPlace(rows, "c")).toEqual({ parentId: null, index: 2 });
  });
});
