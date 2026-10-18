import { expect, it } from "vite-plus/test";
import { countActiveFilters } from "./count-active-filters";

it("counts each filtered subject once", () => {
  expect(
    countActiveFilters({
      status: ["todo", "done"],
      priority: null,
      assignee: [],
      dueDate: ["noDueDate"],
      labels: null,
      release: null,
      customFields: { size: ["L"], team: [] },
    }),
  ).toBe(3);
});

it("counts the release filter, including No release", () => {
  expect(
    countActiveFilters({
      status: null,
      priority: null,
      assignee: null,
      dueDate: null,
      labels: null,
      release: ["none", "r1"],
      customFields: null,
    }),
  ).toBe(1);
});
