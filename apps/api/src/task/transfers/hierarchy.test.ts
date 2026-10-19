import { describe, expect, it } from "vite-plus/test";
import { planTransferHierarchy } from "./hierarchy";

const tasks = [
  { key: "feature", type: "feature" as const },
  {
    key: "bug",
    type: "bug" as const,
    featureKey: "feature",
    milestoneKey: "m",
  },
];
const milestone = {
  key: "m",
  featureKey: "feature",
  title: " First ",
  position: 0,
};

describe("portable milestone hierarchy", () => {
  it("preserves source links without using them as database IDs", () => {
    const plan = planTransferHierarchy(tasks, [milestone]);
    expect([...plan.memberships]).toEqual([["bug", "feature"]]);
    expect([...plan.links]).toEqual([["bug", "m"]]);
    expect(plan.milestones[0]?.title).toBe("First");
  });

  it.each([
    { tasks: [...tasks, tasks[0]!], milestones: [milestone] },
    { tasks, milestones: [milestone, milestone] },
    {
      tasks: [{ ...tasks[1]!, featureKey: "missing" }],
      milestones: [milestone],
    },
    { tasks, milestones: [{ ...milestone, featureKey: "bug" }] },
    {
      tasks: [tasks[0]!, { ...tasks[1]!, featureKey: null }],
      milestones: [milestone],
    },
    { tasks, milestones: [{ ...milestone, targetDate: "2026-02-30" }] },
    { tasks, milestones: [{ ...milestone, startDate: "2026-02-30" }] },
    { tasks, milestones: [{ ...milestone, endDate: "2026-02-30" }] },
    {
      tasks,
      milestones: [
        { ...milestone, startDate: "2026-10-22", endDate: "2026-10-21" },
      ],
    },
    { tasks, milestones: [{ ...milestone, title: " " }] },
    { tasks, milestones: [{ ...milestone, position: -1 }] },
    { tasks: [{ ...tasks[0]!, featureKey: "feature" }], milestones: [] },
  ])(
    "rejects invalid references or definitions before any writes: %j",
    (document) => {
      expect(() =>
        planTransferHierarchy(document.tasks, document.milestones),
      ).toThrow();
    },
  );

  it("retains older connected-source Feature membership", () => {
    const plan = planTransferHierarchy(
      [
        { key: "parent", type: "feature" },
        { key: "child", type: "task" },
      ],
      [],
      new Map([["child", "parent"]]),
    );
    expect(plan.memberships.get("child")).toBe("parent");
    expect(plan.milestones).toEqual([]);
  });
  it("preserves date ranges and maps legacy targetDate only when endDate is absent", () => {
    const legacy = planTransferHierarchy(tasks, [
      { ...milestone, targetDate: "2026-11-01" },
    ]).milestones[0];
    expect(legacy).toMatchObject({ startDate: null, endDate: "2026-11-01" });
    expect(legacy).not.toHaveProperty("targetDate");
    const cleared = planTransferHierarchy(tasks, [
      {
        ...milestone,
        targetDate: "2026-11-01",
        startDate: "2026-12-01",
        endDate: null,
      },
    ]).milestones[0];
    expect(cleared).toMatchObject({ startDate: "2026-12-01", endDate: null });
    expect(
      planTransferHierarchy(tasks, [
        { ...milestone, startDate: "2026-10-01", endDate: "2026-11-01" },
      ]).milestones[0],
    ).toMatchObject({ startDate: "2026-10-01", endDate: "2026-11-01" });
  });
});
