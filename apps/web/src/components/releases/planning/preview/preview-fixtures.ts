import type { Release } from "@/types/release";
import type { ReleasePlanPreview, ReleasePlanTask } from "@/types/release-plan";

export function previewTask(
  taskId: string,
  overrides: Partial<ReleasePlanTask> = {},
): ReleasePlanTask {
  return {
    taskId,
    title: `Work ${taskId}`,
    number: 1,
    identifier: `EPD-${taskId}`,
    type: "task",
    completed: false,
    assigneeId: "max",
    assigneeName: "Max",
    currentAssigneeId: "max",
    currentAssigneeName: "Max",
    estimateSeconds: 14400,
    priority: "no-priority",
    currentStart: null,
    currentEnd: null,
    start: "2026-10-26T09:00:00Z",
    end: "2026-10-26T13:00:00Z",
    segments: [{ start: "2026-10-26T09:00:00Z", end: "2026-10-26T13:00:00Z" }],
    reason: null,
    changed: true,
    ...overrides,
  };
}
export function releasePreview(
  tasks: ReleasePlanTask[],
  overrides: Partial<ReleasePlanPreview> = {},
): ReleasePlanPreview {
  return {
    asOf: "2026-10-25T12:00:00Z",
    expiresAt: "2099-10-25T12:15:00Z",
    planFrom: "2026-10-26T09:00:00Z",
    revision: "token",
    inputRevision: "inputs",
    generation: 1,
    timeZone: "Europe/Belgrade",
    tasks,
    dependencies: [],
    releaseDates: {
      startDate: "2026-10-26",
      codeFreezeDate: "2026-10-29",
      submissionDate: "2026-10-30",
    },
    diagnostics: [],
    warnings: [],
    scheduledCount: tasks.filter((task) => task.start && !task.completed)
      .length,
    unscheduledCount: tasks.filter((task) => !task.start && !task.completed)
      .length,
    changedCount: tasks.filter((task) => task.changed).length,
    ...overrides,
  };
}
export const previewRelease: Release = {
  id: "release",
  projectId: "project",
  name: "0.70",
  description: null,
  startDate: "2026-10-26",
  codeFreezeDate: "2026-10-29",
  submissionDate: "2026-10-30",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  progress: {
    tasks: { total: 0, completed: 0 },
    features: { total: 0, completed: 0 },
    milestones: { total: 0, completed: 0 },
    unfinished: 0,
  },
};
