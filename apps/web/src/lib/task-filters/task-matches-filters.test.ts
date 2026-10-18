import { describe, expect, it } from "vite-plus/test";
import type { BoardFilters } from "@/hooks/use-task-filters";
import type Task from "@/types/task";
import {
  type TaskFilterContext,
  taskMatchesFilters,
} from "./task-matches-filters";

const noFilters: BoardFilters = {
  status: null,
  priority: null,
  assignee: null,
  dueDate: null,
  labels: null,
  release: null,
  customFields: null,
};

const context: TaskFilterContext = {
  projectSlug: "WEB",
  weekStartsOn: 1,
  today: new Date(2026, 9, 14),
  getCustomFieldValues: (taskId) =>
    taskId === "t1" ? [{ fieldId: "size", value: "L" }] : [],
};

function task(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    title: "Build pricing page",
    number: 18,
    description: "Plans and FAQ",
    status: "in-progress",
    priority: "high",
    dueDate: "2026-10-16",
    userId: "u1",
    labels: [{ id: "l1", name: "Engineering", color: "blue" }],
    releaseId: "r1",
    ...overrides,
  } as Task;
}

describe("taskMatchesFilters", () => {
  it.each([
    ["pricing", true],
    ["faq", true],
    ["web-1", true],
    ["#18", true],
    ["18", true],
    ["#19", false],
    ["checkout", false],
  ])("matches the query %s: %s", (query, expected) => {
    expect(taskMatchesFilters(task({}), noFilters, { ...context, query })).toBe(
      expected,
    );
  });

  it("matches tasks the server found by description", () => {
    expect(
      taskMatchesFilters(task({ description: null }), noFilters, {
        ...context,
        query: "hidden",
        descriptionMatches: new Set(["t1"]),
      }),
    ).toBe(true);
  });

  it.each([
    [{ status: ["in-progress"] }, true],
    [{ status: ["done"] }, false],
    [{ priority: ["urgent", "high"] }, true],
    [{ priority: ["low"] }, false],
    [{ assignee: ["u1"] }, true],
    [{ assignee: ["u2"] }, false],
    [{ labels: ["l2", "l1"] }, true],
    [{ labels: ["l2"] }, false],
    [{ customFields: { size: ["L", "XL"] } }, true],
    [{ customFields: { size: ["S"] } }, false],
  ] as Array<[Partial<BoardFilters>, boolean]>)(
    "applies %o",
    (filters, expected) => {
      expect(
        taskMatchesFilters(task({}), { ...noFilters, ...filters }, context),
      ).toBe(expected);
    },
  );

  it.each([
    ["2026-10-16", ["dueThisWeek"], true],
    ["2026-10-21", ["dueThisWeek"], false],
    ["2026-10-21", ["dueNextWeek"], true],
    [null, ["noDueDate"], true],
    ["2026-10-16", ["noDueDate"], false],
    [null, ["dueThisWeek", "noDueDate"], true],
  ] as Array<[string | null, string[], boolean]>)(
    "treats due date %s against %o as %s",
    (dueDate, dueFilters, expected) => {
      expect(
        taskMatchesFilters(
          task({ dueDate }),
          { ...noFilters, dueDate: dueFilters },
          context,
        ),
      ).toBe(expected);
    },
  );

  it("requires a value for every filtered custom field", () => {
    expect(
      taskMatchesFilters(
        task({ id: "t2" }),
        { ...noFilters, customFields: { size: ["L"] } },
        context,
      ),
    ).toBe(false);
  });

  it.each([
    [{ priority: ["high"], negated: ["priority"] }, false],
    [{ priority: ["low"], negated: ["priority"] }, true],
    [{ labels: ["l1"], negated: ["labels"] }, false],
    [{ dueDate: ["noDueDate"], negated: ["dueDate"] }, true],
    [{ customFields: { size: ["S"] }, negated: ["customField:size"] }, true],
    [{ customFields: { size: ["L"] }, negated: ["customField:size"] }, false],
  ] as Array<[Partial<BoardFilters>, boolean]>)(
    "inverts negated subjects %o",
    (filters, expected) => {
      expect(
        taskMatchesFilters(task({}), { ...noFilters, ...filters }, context),
      ).toBe(expected);
    },
  );

  it.each([
    ["r1", ["r1"], [], true],
    ["r1", ["r2", "r1"], [], true],
    ["r1", ["r2"], [], false],
    ["r1", ["none"], [], false],
    [null, ["none"], [], true],
    [undefined, ["none"], [], true],
    [null, ["r1"], [], false],
    ["r1", ["r1"], ["release"], false],
    ["r1", ["r2"], ["release"], true],
    [null, ["none"], ["release"], false],
    [null, ["r1"], ["release"], true],
  ] as Array<[string | null | undefined, string[], string[], boolean]>)(
    "matches release %s against %o (negated %o): %s",
    (releaseId, release, negated, expected) => {
      expect(
        taskMatchesFilters(
          task({ releaseId }),
          { ...noFilters, release, negated },
          context,
        ),
      ).toBe(expected);
    },
  );

  it("treats a missing custom field value as not matching a negated filter", () => {
    expect(
      taskMatchesFilters(
        task({ id: "t2" }),
        {
          ...noFilters,
          customFields: { size: ["L"] },
          negated: ["customField:size"],
        },
        context,
      ),
    ).toBe(true);
  });
});
