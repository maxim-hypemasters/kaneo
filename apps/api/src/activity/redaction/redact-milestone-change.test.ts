import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
vi.mock("../../project-access/find-accessible-projects", () => ({
  findAccessibleProjects: vi.fn(),
}));
vi.mock("./legacy-feature-projects", () => ({
  legacyFeatureProjects: vi.fn().mockResolvedValue(new Map()),
}));
import { findAccessibleProjects } from "../../project-access/find-accessible-projects";
import { redactInaccessibleActivity } from "./redact-inaccessible-activity";

beforeEach(() => vi.clearAllMocks());
describe("milestone activity redaction", () => {
  const row = {
    taskId: "task",
    type: "milestone_changed",
    eventData: {
      projectId: "private",
      oldMilestoneId: "old",
      oldMilestoneTitle: "Secret",
      newMilestoneId: null,
      newMilestoneTitle: null,
    },
  };
  it("hides milestone names after the task leaves an inaccessible project", async () => {
    vi.mocked(findAccessibleProjects).mockResolvedValue(new Map());
    expect(
      (await redactInaccessibleActivity("viewer", [row]))[0]?.eventData,
    ).toMatchObject({
      oldMilestoneId: "old",
      oldMilestoneTitle: null,
      projectId: null,
    });
  });
  it("retains names for a viewer with access to the historical project", async () => {
    vi.mocked(findAccessibleProjects).mockResolvedValue(
      new Map([["private", "private"]]),
    );
    expect((await redactInaccessibleActivity("viewer", [row]))[0]).toBe(row);
  });
  it.each([
    "feature_planning_snapshot",
    "milestone_created",
    "milestone_updated",
    "milestone_deleted",
    "milestone_completed",
    "milestone_reopened",
  ])(
    "hides historical %s metadata when its project is inaccessible",
    async (type) => {
      vi.mocked(findAccessibleProjects).mockResolvedValue(new Map());
      const historical = {
        taskId: "feature",
        type,
        eventData: {
          projectId: "private",
          milestoneId: "secret-id",
          milestoneTitle: "Secret launch",
          releaseName: "Secret release",
          changes: { title: { from: "Secret", to: "More secret" } },
        },
      };
      const result = (
        await redactInaccessibleActivity("viewer", [historical])
      )[0];
      expect(result?.eventData).toEqual({
        projectId: null,
        milestoneId: null,
        milestoneTitle: null,
        changes: {},
        redacted: true,
      });
      expect(findAccessibleProjects).toHaveBeenCalledWith("viewer", [
        "private",
      ]);
    },
  );
  it("retains immutable Feature planning history for an authorized viewer", async () => {
    vi.mocked(findAccessibleProjects).mockResolvedValue(
      new Map([["private", "private"]]),
    );
    const snapshot = {
      taskId: "feature",
      type: "feature_planning_snapshot",
      eventData: {
        projectId: "private",
        status: "done",
        releaseName: "Launch",
      },
    };
    expect((await redactInaccessibleActivity("viewer", [snapshot]))[0]).toBe(
      snapshot,
    );
  });
});
