import { describe, expect, it } from "vite-plus/test";
import type { ReleasePlanChanges } from "@/types/release-plan";
import { lateTaskIds } from "../release-plan-changes";
import {
  previewRelease,
  previewTask,
  releasePreview,
} from "../preview/preview-fixtures";
import {
  downstreamTasks,
  moveTasks,
  nextRelease,
  releaseWorkGroups,
  undoMove,
} from "./resolution-model";

describe("release code-freeze resolution model", () => {
  it("groups all release work by milestone identity and manual order, with No milestone last", () => {
    const tasks = [
      previewTask("second", {
        milestoneId: "m2",
        milestoneTitle: "Phase",
        milestonePosition: 2,
        featureId: "f",
        featureTitle: "Chat",
      }),
      previewTask("none"),
      previewTask("first", {
        milestoneId: "m1",
        milestoneTitle: "Phase",
        milestonePosition: 1,
        featureId: "f",
        featureTitle: "Chat",
      }),
      previewTask("done", { completed: true }),
      previewTask("on-time"),
      previewTask("archived", { reason: "archived" }),
    ];
    const groups = releaseWorkGroups(tasks);
    expect(groups.map(({ id }) => id)).toEqual(["m1", "m2", null]);
    expect(
      groups.flatMap(({ tasks }) => tasks.map(({ taskId }) => taskId)),
    ).toEqual(["first", "second", "none", "done", "on-time", "archived"]);
    expect(groups[0].featureTitle).toBe("Chat");
  });

  it("orders each group's work by finish time with undated work last", () => {
    const milestone = { milestoneId: "m1", milestoneTitle: "Phase" };
    const groups = releaseWorkGroups([
      previewTask("milestone-undated", { ...milestone, end: null }),
      previewTask("milestone-later", {
        ...milestone,
        end: "2026-10-28T07:00:00Z",
      }),
      previewTask("milestone-offset", {
        ...milestone,
        end: "2026-10-28T08:00:00+02:00",
      }),
      previewTask("milestone-tied", {
        ...milestone,
        end: "2026-10-28T06:00:00Z",
      }),
      previewTask("unassigned-undated", { end: null }),
      previewTask("unassigned-later", { end: "2026-10-29T08:00:00Z" }),
      previewTask("unassigned-earlier", { end: "2026-10-29T06:00:00Z" }),
    ]);

    expect(
      groups.map(({ tasks }) => tasks.map(({ taskId }) => taskId)),
    ).toEqual([
      [
        "milestone-offset",
        "milestone-tied",
        "milestone-later",
        "milestone-undated",
      ],
      ["unassigned-earlier", "unassigned-later", "unassigned-undated"],
    ]);
  });

  it("identifies unfinished late work once even when it has repeated warnings", () => {
    const tasks = [
      previewTask("late"),
      previewTask("on-time"),
      previewTask("done", { completed: true }),
      previewTask("archived", { reason: "archived" }),
    ];
    const preview = releasePreview(tasks, {
      warnings: ["late", "done", "archived", "late"].map((taskId) => ({
        taskId,
        reason: "after_code_freeze",
      })),
    });
    expect(lateTaskIds(preview)).toEqual(new Set(["late"]));
  });

  it("orders duplicate milestone names from different Features deterministically", () => {
    const tasks = [
      previewTask("z", {
        milestoneId: "m-z",
        milestoneTitle: "Phase",
        featureId: "z",
        featureTitle: "Zebra",
      }),
      previewTask("a", {
        milestoneId: "m-a",
        milestoneTitle: "Phase",
        featureId: "a",
        featureTitle: "Alpha",
      }),
    ];
    const groups = releaseWorkGroups(tasks);
    expect(groups.map(({ id }) => id)).toEqual(["m-a", "m-z"]);
  });

  it("chooses the nearest strictly later release using name and ID tie-breaks", () => {
    const first = {
      ...previewRelease,
      id: "b",
      name: "1.0",
      startDate: "2026-11-01",
    };
    const sameDate = { ...first, id: "a" };
    const farther = { ...first, id: "farther", startDate: "2026-12-01" };
    const sameStart = {
      ...first,
      id: "same-start",
      startDate: previewRelease.startDate,
    };
    expect(
      nextRelease(previewRelease, [farther, first, sameStart, sameDate]),
    ).toBe(sameDate);
    expect(
      nextRelease(previewRelease, [previewRelease, sameStart]),
    ).toBeUndefined();
  });

  it("offers transitive dependents once, tolerates cycles, and excludes completed or archived branches", () => {
    const tasks = [
      previewTask("a"),
      previewTask("b"),
      previewTask("c"),
      previewTask("done", { completed: true }),
      previewTask("after-done"),
      previewTask("archived", { reason: "archived" }),
      previewTask("unrelated"),
    ];
    const dependencies = [
      ["a", "b"],
      ["b", "c"],
      ["a", "c"],
      ["c", "a"],
      ["a", "done"],
      ["done", "after-done"],
      ["a", "archived"],
    ].map(([blockerId, blockedId]) => ({ blockerId, blockedId }));
    expect(
      downstreamTasks(releasePreview(tasks, { dependencies }), "a").map(
        ({ taskId }) => taskId,
      ),
    ).toEqual(["b", "c"]);
  });

  it("merges moves by stable task ID and preserves date changes", () => {
    const changes: ReleasePlanChanges = {
      releaseDates: {
        codeFreezeDate: "2026-11-01",
        submissionDate: "2026-11-02",
      },
      moves: [{ taskId: "a", target: { releaseId: "old" } }],
    };
    const next = moveTasks(changes, ["a", "b", "b"], { releaseId: "next" });
    expect(next.moves).toEqual([
      { taskId: "a", target: { releaseId: "next" } },
      { taskId: "b", target: { releaseId: "next" } },
    ]);
    expect(next.releaseDates).toEqual(changes.releaseDates);
    expect(changes.moves?.[0].target).toEqual({ releaseId: "old" });
  });

  it("keeps a draft destination until its last move is undone", () => {
    const newRelease = {
      key: "draft",
      name: "0.71",
      startDate: "2026-11-01",
      codeFreezeDate: "2026-11-05",
      submissionDate: "2026-11-06",
    };
    const changes = moveTasks(
      {},
      ["a", "b"],
      { draftKey: "draft" },
      newRelease,
    );
    const oneLeft = undoMove(changes, "a");
    expect(oneLeft.newRelease).toEqual(newRelease);
    expect(undoMove(oneLeft, "b")).toEqual({});
  });
});
