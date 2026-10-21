import { describe, expect, it } from "vite-plus/test";
import {
  emptyFeatureComposition,
  featureCompositionInput,
  hasFeatureCompositionChanges,
  removeFeatureMilestone,
  validFeatureComposition,
} from "./draft";
import type { FeatureCompositionDraft } from "./types";

const draft = (): FeatureCompositionDraft => ({
  milestones: [
    {
      key: "m",
      title: "  Launch  ",
      leadId: "lead",
      priority: "low",
      releaseId: "r",
    },
  ],
  existingTasks: [
    {
      id: "t",
      title: "Existing",
      type: "task",
      number: 1,
      projectSlug: "WEB",
      releaseId: "old",
      releaseName: "Old release",
      milestoneKey: "m",
    },
  ],
  newTasks: [
    { key: "local", title: "  Fix launch  ", type: "bug", milestoneKey: "m" },
  ],
  unassignedReleaseId: "r",
});

describe("Feature composition drafts", () => {
  it("strips display data and new-work keys while preserving stable milestone references", () => {
    expect(featureCompositionInput(draft())).toEqual({
      milestones: [
        {
          key: "m",
          title: "Launch",
          leadId: "lead",
          priority: "low",
          releaseId: "r",
        },
      ],
      existingTasks: [{ id: "t", milestoneKey: "m" }],
      newTasks: [{ title: "Fix launch", type: "bug", milestoneKey: "m" }],
    });
  });
  it("omits unused release context and retains explicit choices for unassigned new work", () => {
    const value = draft();
    value.unassignedReleaseId = "deleted-origin";
    expect(featureCompositionInput(value)).not.toHaveProperty(
      "unassignedReleaseId",
    );
    value.newTasks = [];
    expect(featureCompositionInput(value)).not.toHaveProperty(
      "unassignedReleaseId",
    );
    value.newTasks = [
      { key: "local", title: "Standalone", type: "task", milestoneKey: null },
    ];
    value.unassignedReleaseId = null;
    expect(featureCompositionInput(value)).toHaveProperty(
      "unassignedReleaseId",
      null,
    );
    value.unassignedReleaseId = "release";
    expect(featureCompositionInput(value)).toHaveProperty(
      "unassignedReleaseId",
      "release",
    );
  });
  it("removes a milestone and its new drafts while retaining existing selections", () => {
    const original = draft();
    original.milestones.push({ ...original.milestones[0], key: "other" });
    original.newTasks.push({
      key: "keep",
      title: "Other work",
      type: "task",
      milestoneKey: "other",
    });
    const removed = removeFeatureMilestone(original, "m");
    expect(removed.milestones).toEqual([original.milestones[1]]);
    expect(removed.existingTasks).toEqual([
      { ...original.existingTasks[0], milestoneKey: null },
    ]);
    expect(removed.newTasks).toEqual([original.newTasks[1]]);
    expect(original.existingTasks[0].milestoneKey).toBe("m");
    expect(original.newTasks[0].milestoneKey).toBe("m");
    expect(validFeatureComposition(removed)).toBe(true);
  });
  it("tracks hierarchy changes separately from a supplied release default", () => {
    expect(hasFeatureCompositionChanges(emptyFeatureComposition())).toBe(false);
    expect(
      hasFeatureCompositionChanges(emptyFeatureComposition("origin"), "origin"),
    ).toBe(false);
    expect(
      hasFeatureCompositionChanges(emptyFeatureComposition(null), "origin"),
    ).toBe(true);
    expect(hasFeatureCompositionChanges(draft(), "r")).toBe(true);
  });
  it("rejects blank titles, duplicate selections, invalid references and oversized batches", () => {
    for (const value of [
      { ...draft(), milestones: [{ ...draft().milestones[0], title: "  " }] },
      { ...draft(), newTasks: [{ ...draft().newTasks[0], title: "  " }] },
      {
        ...draft(),
        existingTasks: [...draft().existingTasks, ...draft().existingTasks],
      },
      {
        ...draft(),
        newTasks: [{ ...draft().newTasks[0], milestoneKey: "missing" }],
      },
      {
        ...draft(),
        newTasks: [{ ...draft().newTasks[0], milestoneKey: null }],
      },
      {
        ...draft(),
        milestones: [...draft().milestones, ...draft().milestones],
      },
      {
        ...draft(),
        newTasks: Array.from({ length: 101 }, (_, index) => ({
          ...draft().newTasks[0],
          key: String(index),
        })),
      },
      {
        ...draft(),
        existingTasks: Array.from({ length: 101 }, (_, index) => ({
          ...draft().existingTasks[0],
          id: String(index),
        })),
      },
      {
        ...draft(),
        milestones: Array.from({ length: 101 }, (_, index) => ({
          ...draft().milestones[0],
          key: String(index),
        })),
      },
    ])
      expect(validFeatureComposition(value)).toBe(false);
    const valid = draft();
    valid.newTasks[0].title = "Long title ".repeat(40);
    expect(validFeatureComposition(valid)).toBe(true);
    expect(validFeatureComposition(emptyFeatureComposition())).toBe(true);
  });
  it("allows duplicate milestone titles and existing work assigned to no milestone", () => {
    const value = draft();
    value.milestones.push({ ...value.milestones[0], key: "m2" });
    value.existingTasks[0].milestoneKey = null;
    expect(validFeatureComposition(value)).toBe(true);
  });
});
