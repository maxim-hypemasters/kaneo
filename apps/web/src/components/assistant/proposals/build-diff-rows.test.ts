import { describe, expect, it } from "vite-plus/test";
import { buildDiffRows as build, hasChanges } from "./build-diff-rows";

// The rows without their keys, which a test below checks on their own.
const buildDiffRows = (before: string, after: string) =>
  build(before, after).map(({ key: _key, ...row }) => row);

const lines = (count: number, prefix = "line") =>
  Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);

describe("buildDiffRows", () => {
  it("marks added and removed lines", () => {
    const rows = buildDiffRows(
      "# Plan\nOld step\n",
      "# Plan\nNew step\nMore\n",
    );
    expect(rows).toEqual([
      { kind: "unchanged", text: "# Plan" },
      { kind: "removed", text: "Old step" },
      { kind: "added", text: "New step" },
      { kind: "added", text: "More" },
    ]);
    expect(hasChanges(rows)).toBe(true);
  });

  it("folds unchanged lines away from changes", () => {
    const before = [...lines(10), "middle", ...lines(10, "tail")].join("\n");
    const after = [...lines(10), "changed", ...lines(10, "tail")].join("\n");

    expect(buildDiffRows(before, after)).toEqual([
      { kind: "skipped", count: 7 },
      { kind: "unchanged", text: "line 8" },
      { kind: "unchanged", text: "line 9" },
      { kind: "unchanged", text: "line 10" },
      { kind: "removed", text: "middle" },
      { kind: "added", text: "changed" },
      { kind: "unchanged", text: "tail 1" },
      { kind: "unchanged", text: "tail 2" },
      { kind: "unchanged", text: "tail 3" },
      { kind: "skipped", count: 7 },
    ]);
  });

  it("shows a single unchanged line instead of folding it", () => {
    const before = ["a", ...lines(7), "b"].join("\n");
    const after = ["A", ...lines(7), "B"].join("\n");
    const rows = buildDiffRows(before, after);
    expect(rows.some((row) => row.kind === "skipped")).toBe(false);
    expect(rows.filter((row) => row.kind === "unchanged")).toHaveLength(7);
  });

  it("shows an append as added lines after the end of the text", () => {
    const before = lines(20).join("\n");
    const rows = buildDiffRows(before, `${before}\n\n## Notes\nShip it`);
    expect(rows).toEqual([
      { kind: "skipped", count: 17 },
      { kind: "unchanged", text: "line 18" },
      { kind: "unchanged", text: "line 19" },
      { kind: "unchanged", text: "line 20" },
      { kind: "added", text: "" },
      { kind: "added", text: "## Notes" },
      { kind: "added", text: "Ship it" },
    ]);
  });

  it("reports text that stays the same", () => {
    const rows = build("same\ntext", "same\ntext");
    expect(rows).toEqual([{ key: "0:0", kind: "skipped", count: 2 }]);
    expect(hasChanges(rows)).toBe(false);
  });

  it("keys every row by where it starts", () => {
    const before = [...lines(10), "old", "gone", ...lines(10, "tail")].join(
      "\n",
    );
    const after = [...lines(10), "new", ...lines(10, "tail")].join("\n");
    const keys = build(before, after).map((row) => row.key);
    expect(keys).toEqual([
      "0:0",
      "7:7",
      "8:8",
      "9:9",
      "10:10",
      "11:10",
      "12:10",
      "12:11",
      "13:12",
      "14:13",
      "15:14",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
