import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { assigneeMenuOptions } from "./assignee-menu-options";

const members = [{ id: "user-1", name: "John Doe", email: null, image: null }];

function selectedValues(current: string | null | undefined) {
  return assigneeMenuOptions(members, current, "Unassigned")
    .filter((option) => option.selected)
    .map((option) => option.value);
}

describe("assigneeMenuOptions", () => {
  it("lists unassigned first, then members", () => {
    expect(
      assigneeMenuOptions(members, null, "Unassigned").map(
        (option) => option.label,
      ),
    ).toEqual(["Unassigned", "John Doe"]);
  });

  it("marks unassigned when nobody is assigned", () => {
    expect(selectedValues(null)).toEqual([""]);
  });

  it("marks the assigned member", () => {
    expect(selectedValues("user-1")).toEqual(["user-1"]);
  });

  it("marks nothing when the selection is mixed", () => {
    expect(selectedValues(undefined)).toEqual([]);
  });

  it("adds the away hint and badge for members away today", () => {
    const options = assigneeMenuOptions(
      [...members, { id: "user-2", name: "Ana Lee", email: null, image: null }],
      null,
      "Unassigned",
      new Map([["user-2", "Away until Nov 20"]]),
    );

    expect(options.map((option) => option.hint)).toEqual([
      undefined,
      undefined,
      "Away until Nov 20",
    ]);
    const { container } = render(<>{options[2]?.icon}</>);
    const badge = container.querySelector('[data-slot="away-badge"]');
    expect(badge?.getAttribute("title")).toBe("Away until Nov 20");
    // The hint already says it next to the name.
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
    expect(
      render(<>{options[1]?.icon}</>).container.querySelector(
        '[data-slot="away-badge"]',
      ),
    ).toBeNull();
  });
});
