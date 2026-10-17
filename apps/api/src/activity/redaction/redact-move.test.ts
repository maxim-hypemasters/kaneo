import { describe, expect, it } from "vite-plus/test";
import { moveProjectIds, redactMove } from "./redact-move";

const move = {
  fromProjectId: "alpha",
  fromProjectName: "Alpha",
  toProjectId: "beta",
  toProjectName: "Beta",
  oldStatus: "to-do",
};

describe("redactMove", () => {
  it("names both projects of a move", () => {
    expect(moveProjectIds(move)).toEqual(["alpha", "beta"]);
  });

  it("hides only the side the viewer can't see", () => {
    expect(redactMove(move, (id) => id === "beta")).toEqual({
      ...move,
      fromProjectId: null,
      fromProjectName: null,
    });
  });

  it("returns the data itself when both sides are visible", () => {
    expect(redactMove(move, () => true)).toBe(move);
  });
});
