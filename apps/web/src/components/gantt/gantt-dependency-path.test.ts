import { describe, expect, it } from "vite-plus/test";
import { DEPENDENCY_STUB_PX, dependencyPath } from "./gantt-dependency-path";

describe("dependencyPath", () => {
  it("turns once between the bars when there is room", () => {
    expect(dependencyPath({ x: 100, y: 20 }, { x: 180, y: 84 }, 22)).toBe(
      `M 100 20 H ${100 + DEPENDENCY_STUB_PX} V 84 H 180`,
    );
  });

  it("detours along the top of the blocked row when it starts too early", () => {
    expect(dependencyPath({ x: 200, y: 20 }, { x: 150, y: 64 }, 22)).toBe(
      `M 200 20 H ${200 + DEPENDENCY_STUB_PX} V 42 H ${150 - DEPENDENCY_STUB_PX} V 64 H 150`,
    );
  });

  it("stays clear of the rows in between", () => {
    // Rows 44px tall: blocker in row 0, blocked in row 3. The jog runs on
    // the boundary of rows 2 and 3, not through row 1 or 2.
    expect(dependencyPath({ x: 200, y: 22 }, { x: 150, y: 154 }, 22)).toContain(
      "V 132",
    );
  });

  it("detours along the bottom edge for a blocked task in an earlier row", () => {
    expect(dependencyPath({ x: 200, y: 154 }, { x: 205, y: 22 }, 22)).toContain(
      "V 44",
    );
  });
});
