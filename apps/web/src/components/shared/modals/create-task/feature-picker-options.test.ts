import { describe, expect, it } from "vite-plus/test";
import {
  choiceOf,
  type FeatureChoice,
  featurePickerOptions,
  type ProjectFeature,
} from "./feature-picker-options";

const feature = (
  id: string,
  title: string,
  number: number | null,
  status = "to-do",
): ProjectFeature => ({ id, title, number, status });

const features = [
  feature("checkout", "Checkout", 3),
  feature("search", "Search", 4),
  feature("old", "Old billing", 5, "archived"),
  feature("draft", "Draft", null),
];

const list = (query: string, choice: FeatureChoice | null = null) =>
  featurePickerOptions({ features, query, choice, slug: "WEB" }).map(
    (option) => ({
      kind: option.kind,
      value: option.value,
      selected: option.selected,
      ...(option.kind === "feature" ? { displayId: option.displayId } : {}),
      ...(option.kind === "new" ? { title: option.title } : {}),
    }),
  );

describe("featurePickerOptions", () => {
  it("lists no feature, then the features that aren't archived, with their IDs", () => {
    expect(list("")).toEqual([
      { kind: "none", value: "", selected: true },
      {
        kind: "feature",
        value: "checkout",
        selected: false,
        displayId: "WEB-3",
      },
      { kind: "feature", value: "search", selected: false, displayId: "WEB-4" },
      { kind: "feature", value: "draft", selected: false, displayId: null },
    ]);
  });

  it("finds features by title or ID and offers to create the search", () => {
    expect(list("  chec ")).toEqual([
      {
        kind: "feature",
        value: "checkout",
        selected: false,
        displayId: "WEB-3",
      },
      { kind: "new", value: ":create", selected: false, title: "chec" },
    ]);
    expect(list("web-4").map(({ value }) => value)).toEqual([
      "search",
      ":create",
    ]);
  });

  it("offers no creation for a title a feature already has", () => {
    expect(list("CHECKOUT").map(({ value }) => value)).toEqual(["checkout"]);
  });

  it("offers creation over an archived feature's title, which stays hidden", () => {
    expect(list("old billing")).toEqual([
      { kind: "new", value: ":create", selected: false, title: "old billing" },
    ]);
  });

  it("marks the chosen feature", () => {
    const options = list("", {
      kind: "existing",
      id: "search",
      title: "Search",
    });
    expect(options.filter(({ selected }) => selected)).toEqual([
      { kind: "feature", value: "search", selected: true, displayId: "WEB-4" },
    ]);
  });

  it("keeps a chosen new feature listed, and doesn't offer it twice", () => {
    const chosen: FeatureChoice = { kind: "new", title: "Payments" };
    expect(list("", chosen).slice(0, 2)).toEqual([
      { kind: "none", value: "", selected: false },
      { kind: "new", value: ":chosen-new", selected: true, title: "Payments" },
    ]);
    expect(list("payments", chosen)).toEqual([
      { kind: "new", value: ":chosen-new", selected: true, title: "Payments" },
    ]);
  });

  it("shows IDs only when the project's slug is known", () => {
    const [, first] = featurePickerOptions({
      features,
      query: "",
      choice: null,
      slug: undefined,
    });
    expect(first).toMatchObject({ kind: "feature", displayId: null });
  });
});

describe("choiceOf", () => {
  it("turns an option into what the dialog keeps", () => {
    const [none, chosenNew, checkout] = featurePickerOptions({
      features,
      query: "",
      choice: { kind: "new", title: "Payments" },
      slug: "WEB",
    });
    expect(choiceOf(none)).toBeNull();
    expect(choiceOf(chosenNew)).toEqual({ kind: "new", title: "Payments" });
    expect(choiceOf(checkout)).toEqual({
      kind: "existing",
      id: "checkout",
      title: "Checkout",
    });
  });
});
