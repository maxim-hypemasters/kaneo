import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import type { AppliedSuggestion } from "@/fetchers/agent/apply-task-agent-suggestion";
import { invalidateAppliedSuggestion } from "./invalidate-applied-suggestion";

function refreshed(
  result: AppliedSuggestion | undefined,
  target: { taskId: string; projectId?: string } = {
    taskId: "t1",
    projectId: "p1",
  },
) {
  const invalidateQueries = vi.fn();
  invalidateAppliedSuggestion(
    { invalidateQueries } as unknown as QueryClient,
    target,
    result,
  );
  return invalidateQueries.mock.calls.map(([filters]) => filters.queryKey);
}

const applied = (
  overrides: Partial<AppliedSuggestion> = {},
): AppliedSuggestion => ({
  ok: true,
  kind: "priority",
  assigneeChanged: false,
  datesChanged: false,
  ...overrides,
});

describe("invalidateAppliedSuggestion", () => {
  it("refreshes only the task after a description addition", () => {
    expect(refreshed(applied({ kind: "description" }))).toEqual([
      ["task-agent", "t1"],
      ["task", "t1"],
      ["activities", "t1"],
    ]);
  });

  it("refreshes the board, my work, test cases and milestones after a field", () => {
    const keys = refreshed(applied());
    for (const key of [
      ["tasks", "p1"],
      ["assigned-tasks"],
      ["test-cases", "p1"],
      ["feature-milestones", "p1"],
    ])
      expect(keys).toContainEqual(key);
    expect(keys).not.toContainEqual(["project-schedule", "p1"]);
  });

  it("refreshes the schedule and releases when an estimate set dates", () => {
    const keys = refreshed(
      applied({ kind: "estimate", datesChanged: true, assigneeChanged: true }),
    );
    for (const key of [
      ["project-schedule", "p1"],
      ["releases", "p1"],
      ["release-progress", "p1"],
      ["notifications"],
    ])
      expect(keys).toContainEqual(key);
  });

  it("still refreshes the board after a failed apply", () => {
    const keys = refreshed(undefined);
    expect(keys).toContainEqual(["task-agent", "t1"]);
    expect(keys).toContainEqual(["tasks", "p1"]);
  });

  it("refreshes only the task when no project is given", () => {
    expect(refreshed(applied(), { taskId: "t1" })).toHaveLength(3);
  });
});
