import { describe, expect, it } from "vite-plus/test";
import { releaseScopeGrowth } from "./release-scope-growth";

describe("release scope growth", () => {
  it.each([
    [4, 6, 50],
    [4, 2, -50],
    [4, 4, 0],
    [3, 4, 33],
    [3, 2, -33],
    [4, 0, -100],
    [500, 499, 0],
    [500, 501, 0],
    [200, 201, 1],
    [200, 199, -1],
    [200, 205, 3],
    [200, 195, -3],
  ] as const)(
    "compares baseline %s to current %s as a whole percentage",
    (baseline, current, percent) => {
      expect(releaseScopeGrowth(baseline, current, false)).toEqual({
        kind: "percent",
        percent,
      });
    },
  );

  it("reports tasks added instead of dividing by a zero baseline", () => {
    expect(releaseScopeGrowth(0, 3, false)).toEqual({
      kind: "added",
      count: 3,
    });
    expect(releaseScopeGrowth(0, 0, false)).toEqual({
      kind: "percent",
      percent: 0,
    });
  });

  it("does not infer a missing starting scope", () => {
    expect(releaseScopeGrowth(null, 3, false)).toEqual({ kind: "unknown" });
    expect(releaseScopeGrowth(undefined, 3, false)).toEqual({
      kind: "unknown",
    });
  });

  it("withholds growth before the release starts even with a supplied baseline", () => {
    expect(releaseScopeGrowth(4, 6, true)).toEqual({ kind: "upcoming" });
    expect(releaseScopeGrowth(0, 3, true)).toEqual({ kind: "upcoming" });
    expect(releaseScopeGrowth(null, 3, true)).toEqual({ kind: "upcoming" });
  });
});
