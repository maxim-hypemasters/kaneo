import { describe, expect, it } from "vite-plus/test";
import { makeUi } from "../render/ui.js";
import { stringWidth } from "../render/width.js";
import {
  renderFeatureJoined,
  renderRelationLinked,
  renderRelationsRemoved,
} from "./render-relation-change.js";

const ui = (columns: number) =>
  makeUi({
    color: 0,
    unicode: true,
    hyperlinks: false,
    animate: false,
    columns,
  });

const task = { label: "KAN-3", url: "https://kaneo.test/3" };
const other = { label: "KAN-4", url: "https://kaneo.test/4" };

describe("renderRelationLinked", () => {
  it("reads as a sentence from the first task", () => {
    expect(
      renderRelationLinked(ui(80), {
        type: "blocked-by",
        task,
        other: { ...other, title: "Session timeout" },
      }),
    ).toEqual(["", "  ✓ KAN-3 is now blocked by KAN-4 · Session timeout", ""]);
  });

  it("truncates the other title to the terminal width", () => {
    const [, line = ""] = renderRelationLinked(ui(80), {
      type: "relates-to",
      task,
      other: { ...other, title: "B".repeat(100) },
    });
    expect(stringWidth(line)).toBe(80);
    expect(line.endsWith("…")).toBe(true);
  });
});

describe("renderRelationsRemoved", () => {
  it("describes a single removed relation", () => {
    expect(
      renderRelationsRemoved(ui(80), { types: ["blocks"], task, other })[1],
    ).toBe("  ✓ KAN-3 no longer blocks KAN-4");
  });

  it("words a removed feature link in features", () => {
    expect(
      renderRelationsRemoved(ui(80), { types: ["parent-of"], task, other })[1],
    ).toBe("  ✓ KAN-3 is no longer the feature of KAN-4");
    expect(
      renderRelationsRemoved(ui(80), { types: ["subtask-of"], task, other })[1],
    ).toBe("  ✓ KAN-3 is no longer in feature KAN-4");
  });

  it("counts several removed relations", () => {
    expect(
      renderRelationsRemoved(ui(80), {
        types: ["blocks", "relates-to"],
        task,
        other,
      })[1],
    ).toBe("  ✓ Removed 2 relations between KAN-3 and KAN-4");
  });

  it("falls back for unknown types", () => {
    expect(
      renderRelationsRemoved(ui(80), { types: ["duplicates"], task, other })[1],
    ).toBe("  ✓ Unlinked KAN-3 and KAN-4");
  });
});

describe("renderFeatureJoined", () => {
  const feature = { ...other, title: "Auth overhaul" };

  it("says which feature the task joined", () => {
    expect(
      renderFeatureJoined(ui(80), { task, feature, madeFeature: false }),
    ).toEqual(["", "  ✓ KAN-3 is now in feature KAN-4 · Auth overhaul", ""]);
  });

  it("mentions a task that became a feature", () => {
    expect(
      renderFeatureJoined(ui(80), { task, feature, madeFeature: true }),
    ).toEqual([
      "",
      "  ✓ KAN-3 is now in feature KAN-4 · Auth overhaul",
      "    KAN-4 is now a feature.",
      "",
    ]);
  });
});
