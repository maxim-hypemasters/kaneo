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
});
