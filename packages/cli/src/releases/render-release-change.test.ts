import { describe, expect, it } from "vite-plus/test";
import { makeUi } from "../render/ui.js";
import { renderReleaseChange } from "./render-release-change.js";

const ui = makeUi({
  color: 0,
  unicode: true,
  hyperlinks: false,
  animate: false,
  columns: 80,
});

describe("renderReleaseChange", () => {
  it("joins the name and the details", () => {
    expect(
      renderReleaseChange(ui, {
        verb: "Created",
        name: "2.4",
        details: ["Oct 1 to Oct 24", "", "code freeze Oct 20", "in KAN"],
      }),
    ).toEqual([
      "",
      "  ✓ Created release 2.4 · Oct 1 to Oct 24 · code freeze Oct 20 · in KAN",
      "",
    ]);
  });

  it("strips control characters from names", () => {
    expect(
      renderReleaseChange(ui, {
        verb: "Updated",
        name: "2.4\u001b[31m",
        details: ["renamed from 2.3\u0007"],
      })[1],
    ).toBe("  ✓ Updated release 2.4[31m · renamed from 2.3");
  });
});
