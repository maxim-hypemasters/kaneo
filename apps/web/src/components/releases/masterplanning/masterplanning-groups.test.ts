import { expect, it } from "vite-plus/test";
import type { MilestoneWithFeature } from "@/fetchers/milestone/milestones";
import { groupMasterplanningMilestones } from "./masterplanning-groups";

function milestone(
  id: string,
  releaseId: string | null,
  featureTitle = "Feature",
  position = 0,
  featureId = "f",
): MilestoneWithFeature {
  return {
    id,
    releaseId,
    title: "Duplicate milestone title",
    featureId,
    featureTitle,
    position,
    projectId: "p",
    leadId: null,
    priority: "no-priority",
    status: "done",
    columnId: "done",
    startDate: null,
    endDate: null,
    progress: { total: 0, started: 0, completed: 0 },
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

it("keeps all releases and No release, including empty groups", () => {
  const { groups, unresolved } = groupMasterplanningMilestones(
    [{ id: "active" }, { id: "empty" }],
    [milestone("assigned", "active"), milestone("unassigned", null)],
  );
  expect([...groups.keys()]).toEqual(["active", "empty", null]);
  expect(groups.get("active")?.map(({ id }) => id)).toEqual(["assigned"]);
  expect(groups.get("empty")).toEqual([]);
  expect(groups.get(null)?.map(({ id }) => id)).toEqual(["unassigned"]);
  expect(unresolved).toEqual([]);
});

it("uses only explicit membership and does not reclassify unresolved releases", () => {
  const unresolvedMilestone = milestone("missing", "not-loaded");
  const { groups, unresolved } = groupMasterplanningMilestones(
    [{ id: "release" }],
    [milestone("assigned", "release"), unresolvedMilestone],
  );
  expect(groups.get(null)).toEqual([]);
  expect(unresolved).toEqual([unresolvedMilestone]);
  expect([...groups.values()].flat()).toHaveLength(1);
});

it("sorts by Feature title and identity, then manual position and milestone ID", () => {
  const values = [
    milestone("z", "r", "Alpha", 2, "a"),
    milestone("b", "r", "Alpha", 1, "a"),
    milestone("a", "r", "Alpha", 1, "a"),
    milestone("same-title", "r", "Alpha", 0, "b"),
    milestone("other-feature", "r", "Beta", 0, "a"),
  ];
  const before = [...values];
  const { groups } = groupMasterplanningMilestones([{ id: "r" }], values);
  expect(groups.get("r")?.map(({ id }) => id)).toEqual([
    "a",
    "b",
    "z",
    "same-title",
    "other-feature",
  ]);
  expect(values).toEqual(before);
});

it("retains whole-milestone progress and derived metadata without filtering", () => {
  const value = {
    ...milestone("done-with-archived-work", "r"),
    progress: { total: 4, completed: 3, started: 4 },
    startDate: "2026-10-01",
    endDate: "2026-11-01",
  };
  expect(
    groupMasterplanningMilestones([{ id: "r" }], [value]).groups.get("r"),
  ).toEqual([value]);
});
