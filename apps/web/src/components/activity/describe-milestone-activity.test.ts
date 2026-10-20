import { describe, expect, it } from "vite-plus/test";
import { describeMilestoneActivity } from "./describe-milestone-activity";
const t = (key: string, options?: Record<string, unknown>) =>
  `${key}:${JSON.stringify(options ?? {})}`;
describe("milestone implementation history", () => {
  it("preserves a deleted milestone title", () => {
    expect(
      describeMilestoneActivity(
        "milestone_deleted",
        { milestoneId: "deleted", milestoneTitle: "First release" },
        t,
      ),
    ).toContain("First release");
  });
  it("identifies changed planning fields separately from work completion", () => {
    const value = describeMilestoneActivity(
      "milestone_updated",
      {
        milestoneTitle: "Release",
        changes: {
          status: { from: "to-do", to: "done" },
          leadId: { from: null, to: "u" },
        },
      },
      t,
    );
    expect(value).toContain("tasks:status.label");
    expect(value).toContain("tasks:milestones.lead");
    expect(value).not.toContain("activityCompleted");
  });
  it("renders preserved Feature planning as historical information", () => {
    const value = describeMilestoneActivity(
      "feature_planning_snapshot",
      {
        status: "in-review",
        priority: "high",
        userId: "former-lead",
        releaseId: "r",
        releaseName: "0.70",
        startDate: "2026-10-01",
        dueDate: "2026-10-19",
      },
      t,
    );
    for (const field of [
      "in-review",
      "high",
      "former-lead",
      "0.70",
      "2026-10-01",
      "2026-10-19",
    ])
      expect(value).toContain(field);
  });
});
