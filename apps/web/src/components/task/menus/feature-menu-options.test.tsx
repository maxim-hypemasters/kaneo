import { describe, expect, it } from "vite-plus/test";
import { featureMenuOptions } from "./feature-menu-options";

const labels = { none: "No feature", unknown: "Unknown feature" };
const features = [
  { id: "checkout", title: "Checkout", displayId: "WEB-3" },
  { id: "gone", title: null, displayId: null },
];

describe("featureMenuOptions", () => {
  it("lists no feature first, then the features with their IDs", () => {
    expect(
      featureMenuOptions(features, null, labels).map(
        ({ value, label, hint, pinned }) => ({ value, label, hint, pinned }),
      ),
    ).toEqual([
      { value: "", label: "No feature", hint: undefined, pinned: true },
      {
        value: "checkout",
        label: "Checkout",
        hint: "WEB-3",
        pinned: undefined,
      },
      {
        value: "gone",
        label: "Unknown feature",
        hint: undefined,
        pinned: undefined,
      },
    ]);
  });

  it("marks the current feature, or no feature", () => {
    const selected = (current: string | null) =>
      featureMenuOptions(features, current, labels)
        .filter((option) => option.selected)
        .map((option) => option.value);
    expect(selected(null)).toEqual([""]);
    expect(selected("checkout")).toEqual(["checkout"]);
  });
});
