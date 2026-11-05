import { describe, expect, it } from "vite-plus/test";
import { releasePreview, previewTask } from "./preview/preview-fixtures";
import {
  hasCodeFreezeConflicts,
  normalizePlanChanges,
  planChangesKey,
  plannedMoveTaskIds,
} from "./release-plan-changes";

describe("release planning draft changes", () => {
  it("orders moves deterministically and removes unused draft destinations", () => {
    const newRelease = {
      key: "next",
      name: " 1.1 ",
      startDate: "2026-11-01",
      codeFreezeDate: "2026-11-08",
      submissionDate: "2026-11-10",
    };
    expect(normalizePlanChanges({ newRelease, moves: [] })).toEqual({});
    expect(
      normalizePlanChanges({
        newRelease,
        moves: [
          { taskId: "b", target: { draftKey: "next" } },
          { taskId: "a", target: { releaseId: "existing" } },
        ],
      }),
    ).toEqual({
      moves: [
        { taskId: "a", target: { releaseId: "existing" } },
        { taskId: "b", target: { draftKey: "next" } },
      ],
      newRelease: { ...newRelease, name: "1.1" },
    });
  });
  it("uses the same identity for equivalent changes without retaining mutable objects", () => {
    const moves = [{ taskId: "a", target: { releaseId: "next" } }];
    const normalized = normalizePlanChanges({ moves });
    expect(planChangesKey({ moves })).toBe(planChangesKey(normalized));
    moves[0]!.target.releaseId = "other";
    expect(normalized.moves?.[0]?.target).toEqual({ releaseId: "next" });
  });
  it("retains a draft release used only by a milestone and leaves completed or archived work in place", () => {
    const newRelease = {
      key: "next",
      name: "1.1",
      startDate: "2026-11-01",
      codeFreezeDate: "2026-11-08",
      submissionDate: "2026-11-10",
    };
    const changes = normalizePlanChanges({
      newRelease,
      milestoneMoves: [
        { milestoneId: "milestone", target: { draftKey: newRelease.key } },
      ],
    });
    expect(changes.newRelease).toEqual(newRelease);
    expect(
      plannedMoveTaskIds(changes, [
        previewTask("move", { milestoneId: "milestone" }),
        previewTask("done", { milestoneId: "milestone", completed: true }),
        previewTask("archived", {
          milestoneId: "milestone",
          reason: "archived",
        }),
        previewTask("other", { milestoneId: "other" }),
      ]),
    ).toEqual(new Set(["move"]));
  });
  it("blocks only actual unfinished code-freeze warnings", () => {
    expect(hasCodeFreezeConflicts(null)).toBe(false);
    const value = releasePreview([previewTask("task")]);
    value.warnings = [
      { taskId: value.tasks[0]!.taskId, reason: "after_submission" },
    ];
    expect(hasCodeFreezeConflicts(value)).toBe(false);
    value.warnings[0]!.reason = "after_code_freeze";
    expect(hasCodeFreezeConflicts(value)).toBe(true);
    value.tasks[0]!.completed = true;
    expect(hasCodeFreezeConflicts(value)).toBe(false);
  });
});
