import { describe, expect, it } from "vite-plus/test";
import { ganttReleases } from "./gantt-releases";

const releases = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
const ids = (list: readonly { id: string }[]) => list.map((item) => item.id);

describe("ganttReleases", () => {
  it("draws every release without a release filter", () => {
    expect(ganttReleases(releases, { release: null })).toBe(releases);
    expect(ganttReleases(releases, { release: [] })).toBe(releases);
  });

  it.each([
    [["r2"], [], ["r2"]],
    [["r2", "r3"], [], ["r2", "r3"]],
    [["r2"], ["release"], ["r1", "r3"]],
    [["none"], [], []],
    [["none", "r1"], [], ["r1"]],
    [["none"], ["release"], ["r1", "r2", "r3"]],
    [["none", "r1"], ["release"], ["r2", "r3"]],
    [["r2"], ["priority"], ["r2"]],
  ])("follows release %o negated by %o", (release, negated, expected) => {
    expect(ids(ganttReleases(releases, { release, negated }))).toEqual(
      expected,
    );
  });
});
