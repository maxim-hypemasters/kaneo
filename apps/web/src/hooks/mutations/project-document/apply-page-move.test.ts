import { describe, expect, it } from "vite-plus/test";
import { applyPageMove } from "./apply-page-move";

const pages = [
  { id: "a", parentId: null, position: 0 },
  { id: "b", parentId: null, position: 1 },
  { id: "c", parentId: null, position: 2 },
  { id: "a1", parentId: "a", position: 0 },
  { id: "a2", parentId: "a", position: 1 },
];

const layout = (result: typeof pages) =>
  Object.fromEntries(
    result.map((page) => [page.id, `${page.parentId ?? "-"}:${page.position}`]),
  );

describe("applyPageMove", () => {
  it("reorders a page among its siblings", () => {
    expect(layout(applyPageMove(pages, "a", null, 2))).toMatchObject({
      b: "-:0",
      c: "-:1",
      a: "-:2",
    });
  });

  it("nests a page and closes the gap it leaves", () => {
    expect(layout(applyPageMove(pages, "b", "a", 1))).toMatchObject({
      a: "-:0",
      c: "-:1",
      a1: "a:0",
      b: "a:1",
      a2: "a:2",
    });
  });

  it("moves a sub-page to the top level and clamps the index", () => {
    expect(layout(applyPageMove(pages, "a1", null, 99))).toMatchObject({
      a: "-:0",
      b: "-:1",
      c: "-:2",
      a1: "-:3",
      a2: "a:0",
    });
  });

  it("leaves the tree alone for an unknown page", () => {
    expect(applyPageMove(pages, "x", null, 0)).toBe(pages);
  });
});
