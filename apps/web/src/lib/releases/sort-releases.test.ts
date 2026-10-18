import { describe, expect, it } from "vite-plus/test";
import { compareReleasesByStart, sortReleases } from "./sort-releases";

const release = (
  id: string,
  startDate: string,
  codeFreezeDate: string,
  submissionDate: string,
  name = id,
) => ({ id, name, startDate, codeFreezeDate, submissionDate });

describe("sortReleases", () => {
  it("splits releases into active, upcoming and past, each in its order", () => {
    const releases = [
      release("past-old", "2026-01-01", "2026-01-10", "2026-01-20"),
      release("next", "2026-11-01", "2026-11-10", "2026-11-20"),
      release("frozen", "2026-09-01", "2026-10-10", "2026-10-25"),
      release("later", "2026-12-01", "2026-12-10", "2026-12-20"),
      release("building", "2026-10-01", "2026-10-20", "2026-10-22"),
      release("past-new", "2026-08-01", "2026-08-10", "2026-10-16"),
    ];

    const sorted = sortReleases(releases, "2026-10-17");

    const ids = (list: { id: string }[]) => list.map((item) => item.id);
    expect(ids(sorted.active)).toEqual(["building", "frozen"]);
    expect(ids(sorted.upcoming)).toEqual(["next", "later"]);
    expect(ids(sorted.past)).toEqual(["past-new", "past-old"]);
  });

  it("does not reorder the list it is given", () => {
    const releases = [
      release("b", "2026-12-01", "2026-12-10", "2026-12-20"),
      release("a", "2026-11-01", "2026-11-10", "2026-11-20"),
    ];
    sortReleases(releases, "2026-10-17");
    expect(releases.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("compareReleasesByStart", () => {
  it("orders by start date, then name, then id", () => {
    const list = [
      release("3", "2026-11-01", "2026-11-01", "2026-11-01", "Beta"),
      release("2", "2026-11-01", "2026-11-01", "2026-11-01", "Alpha"),
      release("1", "2026-11-01", "2026-11-01", "2026-11-01", "Alpha"),
      release("0", "2026-12-01", "2026-12-01", "2026-12-01", "Alpha"),
    ];
    expect(list.sort(compareReleasesByStart).map((item) => item.id)).toEqual([
      "1",
      "2",
      "3",
      "0",
    ]);
  });
});
