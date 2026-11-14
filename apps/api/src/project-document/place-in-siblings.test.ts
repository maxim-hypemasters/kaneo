import { describe, expect, it } from "vite-plus/test";
import { placeInSiblings } from "./place-in-siblings";

describe("placeInSiblings", () => {
  it("moves a page within its siblings", () => {
    expect(placeInSiblings(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(placeInSiblings(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("inserts a page coming from another parent", () => {
    expect(placeInSiblings(["a", "b"], "x", 1)).toEqual(["a", "x", "b"]);
  });

  it("clamps the index to the end", () => {
    expect(placeInSiblings(["a", "b"], "x", 99)).toEqual(["a", "b", "x"]);
    expect(placeInSiblings([], "x", 3)).toEqual(["x"]);
  });
});
