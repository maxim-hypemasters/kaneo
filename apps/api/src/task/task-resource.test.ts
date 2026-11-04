import { describe, expect, it } from "vite-plus/test";
import { taskResource } from "./task-resource";

const row = {
  id: "task",
  type: "task" as const,
  status: "to-do",
  priority: "low",
  columnId: "todo",
  userId: "user",
  startDate: new Date("2026-10-24T09:00:00Z"),
  dueDate: new Date("2026-10-24T11:00:00Z"),
  releaseId: null,
  featureId: null,
  milestoneId: null,
  archivedAt: null,
  estimateSeconds: 7200,
  legacyStartDate: new Date("2026-10-01T00:00:00Z"),
  legacyDueDate: new Date("2026-11-01T00:00:00Z"),
  scheduledAssigneeId: "old-assignee",
};

describe("task schedule serialization", () => {
  it("exposes effective bounds and source without internal history or work segments", () => {
    const result = taskResource({
      ...row,
      scheduleSegments: [
        { start: row.startDate.toISOString(), end: row.dueDate.toISOString() },
      ],
    });
    expect(result).toMatchObject({
      estimateSeconds: 7200,
      startDate: row.startDate,
      dueDate: row.dueDate,
      scheduleSource: "applied",
    });
    for (const field of [
      "legacyStartDate",
      "legacyDueDate",
      "scheduleSegments",
      "scheduledAssigneeId",
    ])
      expect(result).not.toHaveProperty(field);
  });
  it("distinguishes legacy bounds from unscheduled work and keeps Features without planning fields", () => {
    expect(
      taskResource({ ...row, scheduleSegments: null }).scheduleSource,
    ).toBe("legacy");
    expect(
      taskResource({
        ...row,
        startDate: null,
        dueDate: null,
        scheduleSegments: [],
      }).scheduleSource,
    ).toBe("none");
    expect(taskResource({ ...row, type: "feature" })).toMatchObject({
      estimateSeconds: null,
      startDate: null,
      dueDate: null,
      scheduleSource: "none",
    });
  });
});
