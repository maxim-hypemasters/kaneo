import { describe, expect, it } from "vite-plus/test";
import { testCaseBugOptions } from "./test-case-bug-options";
import { testCaseMilestoneOptions } from "./test-case-milestone-options";

const strip = (options: ReturnType<typeof testCaseMilestoneOptions>) =>
  options.map(({ value, label, hint, selected, pinned }) => ({
    value,
    label,
    hint,
    selected,
    pinned,
  }));

describe("testCaseMilestoneOptions", () => {
  const milestones = [
    { id: "m1", title: "Beta", featureTitle: "Chat" },
    { id: "m2", title: "GA", featureTitle: "Chat" },
  ];

  it("pins No milestone first and hints each milestone's Feature", () => {
    expect(
      strip(
        testCaseMilestoneOptions(milestones, "m2", {
          none: "No milestone",
          hidden: "Hidden",
        }),
      ),
    ).toEqual([
      {
        value: "",
        label: "No milestone",
        hint: undefined,
        selected: false,
        pinned: true,
      },
      {
        value: "m1",
        label: "Beta",
        hint: "Chat",
        selected: false,
        pinned: undefined,
      },
      {
        value: "m2",
        label: "GA",
        hint: "Chat",
        selected: true,
        pinned: undefined,
      },
    ]);
  });

  it("keeps a linked milestone the list lacks as the selection", () => {
    const options = testCaseMilestoneOptions(milestones, "gone", {
      none: "No milestone",
      hidden: "Hidden",
    });
    expect(options[1]).toMatchObject({
      value: "gone",
      label: "Hidden",
      selected: true,
    });
    expect(options[0]?.selected).toBe(false);
  });
});

describe("testCaseBugOptions", () => {
  const bugs = [
    { id: "b1", number: 7, title: "Crash" },
    { id: "b2", number: null, title: "Typo" },
  ];

  it("labels bugs by number and selects the current one", () => {
    const options = testCaseBugOptions(
      bugs,
      { id: "b1", label: "#7 Crash" },
      { none: "No bug" },
    );
    expect(options.map((option) => [option.label, option.selected])).toEqual([
      ["No bug", false],
      ["#7 Crash", true],
      ["Typo", false],
    ]);
  });

  it("keeps the known label of a linked bug that isn't listed", () => {
    const options = testCaseBugOptions(
      bugs,
      { id: "archived", label: "#3 Old bug" },
      { none: "No bug" },
    );
    expect(options[1]).toMatchObject({
      value: "archived",
      label: "#3 Old bug",
      selected: true,
    });
  });

  it("selects No bug without a link", () => {
    expect(testCaseBugOptions(bugs, null, { none: "No bug" })[0]).toMatchObject(
      { selected: true, pinned: true },
    );
  });
});
