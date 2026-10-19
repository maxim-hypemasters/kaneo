import { describe, expect, it } from "vite-plus/test";
import type { WorkspaceActivity } from "@/fetchers/activity/get-workspace-activities";
import { describeActivity } from "./describe-activity";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

function activity(overrides: Partial<WorkspaceActivity>): WorkspaceActivity {
  return {
    id: "activity-1",
    type: "comment",
    createdAt: "2026-10-02T10:00:00.000Z",
    eventData: null,
    excerpt: null,
    userId: "user-1",
    userName: "Mira",
    userImage: null,
    externalUserName: null,
    externalUserAvatar: null,
    taskId: "task-1",
    taskTitle: "Fix reconnect loop",
    taskNumber: 135,
    projectId: "project-1",
    projectSlug: "WEB",
    ...overrides,
  };
}

describe("describeActivity", () => {
  it("names comments without repeating their body", () => {
    expect(describeActivity(activity({ excerpt: "Looks good" }), t)).toBe(
      "workspace:home.activity.commented",
    );
  });

  it("describes structured events from their event data", () => {
    expect(
      describeActivity(
        activity({
          type: "assignee_changed",
          eventData: { newAssignee: "Alex", isSelfAssigned: false },
        }),
        t,
      ),
    ).toBe('activity:assignedTo {"name":"Alex"}');
    expect(
      describeActivity(
        activity({ type: "due_date_changed", eventData: { newDueDate: null } }),
        t,
      ),
    ).toBe("activity:clearedDueDate");
  });

  it("uses configured status names and falls back for deleted columns", () => {
    expect(
      describeActivity(
        activity({
          type: "status_changed",
          eventData: {
            oldStatus: "review",
            newStatus: "approved",
            oldStatusName: "Awaiting approval",
            newStatusName: "Ready to ship",
          },
        }),
        t,
      ),
    ).toBe(
      'activity:changedStatus {"from":"Awaiting approval","to":"Ready to ship"}',
    );
    expect(
      describeActivity(
        activity({
          type: "status_changed",
          eventData: {
            oldStatus: "removed-lane",
            newStatus: "review",
            newStatusName: "Awaiting approval",
          },
        }),
        t,
      ),
    ).toBe(
      'activity:changedStatus {"from":"Removed Lane","to":"Awaiting approval"}',
    );
  });

  it("describes feature membership and type changes", () => {
    expect(
      describeActivity(
        activity({
          type: "feature_changed",
          eventData: {
            oldFeatureId: "f1",
            oldFeatureTitle: "Checkout",
            newFeatureId: "f2",
            newFeatureTitle: "Payments",
          },
        }),
        t,
      ),
    ).toBe('activity:changedFeature {"from":"Checkout","to":"Payments"}');
    expect(
      describeActivity(
        activity({
          type: "type_changed",
          eventData: { oldType: "task", newType: "feature" },
        }),
        t,
      ),
    ).toBe("activity:changedTypeToFeature");
    expect(describeActivity(activity({ type: "type_changed" }), t)).toBe(
      "workspace:home.activity.updated",
    );
  });

  it("describes release changes, naming hidden releases as unknown", () => {
    expect(
      describeActivity(
        activity({
          type: "release_changed",
          eventData: {
            oldReleaseId: null,
            oldReleaseName: null,
            newReleaseId: "r24",
            newReleaseName: "2.4",
          },
        }),
        t,
      ),
    ).toBe('activity:addedToRelease {"release":"2.4"}');
    expect(
      describeActivity(
        activity({
          type: "release_changed",
          eventData: {
            projectId: null,
            oldReleaseId: "r24",
            oldReleaseName: null,
            newReleaseId: null,
            newReleaseName: null,
          },
        }),
        t,
      ),
    ).toBe('activity:removedFromRelease {"release":"tasks:releases.unknown"}');
    expect(describeActivity(activity({ type: "release_changed" }), t)).toBe(
      "workspace:home.activity.updated",
    );
  });

  it("falls back to the stored text for events without event data", () => {
    expect(
      describeActivity(
        activity({
          type: "status_changed",
          excerpt: "changed status from to-do to done",
        }),
        t,
      ),
    ).toBe("changed status from to-do to done");
    expect(describeActivity(activity({ type: "label_added" }), t)).toBe(
      "workspace:home.activity.updated",
    );
  });
});
