import { describe, expect, it } from "vite-plus/test";
import {
  canonicalReleaseChanges,
  releasePlanChangesSchema,
} from "./release-changes-schema";

const draft = {
  key: "next",
  name: " 0.71 ",
  startDate: "2027-02-01",
  codeFreezeDate: "2027-02-10",
  submissionDate: "2027-02-12",
};

describe("release planning change contracts", () => {
  it("keeps old callers compatible and canonicalizes empty drafts", () => {
    expect(canonicalReleaseChanges()).toEqual({});
    expect(canonicalReleaseChanges({ moves: [] })).toEqual({});
  });
  it("sorts task moves and trims new release names for stable review tokens", () => {
    const moves = [
      { taskId: "b", target: { draftKey: "next" } },
      { taskId: "a", target: { releaseId: "existing" } },
    ];
    expect(canonicalReleaseChanges({ newRelease: draft, moves })).toEqual({
      newRelease: { ...draft, name: "0.71" },
      moves: [moves[1], moves[0]],
    });
  });
  it("does not create an unused destination after all its moves are undone", () => {
    expect(canonicalReleaseChanges({ newRelease: draft })).toEqual({});
  });
  it("rejects duplicate moves and ambiguous destination references", () => {
    const move = { taskId: "task", target: { releaseId: "next" } };
    expect(
      releasePlanChangesSchema.safeParse({ moves: [move, move] }).success,
    ).toBe(false);
    expect(
      releasePlanChangesSchema.safeParse({
        moves: [{ ...move, target: { releaseId: "next", draftKey: "draft" } }],
      }).success,
    ).toBe(false);
  });
  it("rejects unknown draft references and noncalendar dates", () => {
    expect(
      releasePlanChangesSchema.safeParse({
        moves: [{ taskId: "task", target: { draftKey: "missing" } }],
      }).success,
    ).toBe(false);
    expect(
      releasePlanChangesSchema.safeParse({
        releaseDates: {
          codeFreezeDate: "2027-02-30",
          submissionDate: "2027-03-01",
        },
      }).success,
    ).toBe(false);
  });
  it("does not accept task properties or a source start-date change", () => {
    expect(
      releasePlanChangesSchema.safeParse({
        releaseDates: {
          startDate: "2027-01-01",
          codeFreezeDate: "2027-01-10",
          submissionDate: "2027-01-12",
        },
      }).success,
    ).toBe(false);
    expect(
      releasePlanChangesSchema.safeParse({
        moves: [
          {
            taskId: "task",
            target: { releaseId: "next" },
            assigneeId: "other",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
