import { describe, expect, it } from "vite-plus/test";
import type Task from "@/types/task";
import type { ProjectSchedule } from "@/components/scheduling/project-schedule";
import { scheduledWork } from "./scheduled-work";

const task = (values: Partial<Task> = {}): Task => ({
  id: "task",
  title: "Work",
  number: 1,
  description: null,
  status: "to-do",
  priority: "high",
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  projectId: "project",
  userId: "new-assignee",
  assigneeId: "new-assignee",
  assigneeName: "New",
  startDate: "2026-09-01",
  dueDate: "2026-09-02",
  featureId: null,
  milestoneId: null,
  ...values,
});
const placement = {
  taskId: "task",
  assigneeId: "published-assignee",
  start: "2026-09-03T09:00:00Z",
  end: "2026-09-03T17:00:00Z",
  segments: [{ start: "2026-09-03T09:00:00Z", end: "2026-09-03T17:00:00Z" }],
};
const schedule = (values: Partial<ProjectSchedule> = {}): ProjectSchedule => ({
  generation: 1,
  appliedAt: "2026-09-02T09:00:00Z",
  revision: "input",
  outdated: true,
  legacy: false,
  settings: { timeZone: "UTC", estimateDayMinutes: 480 },
  tasks: [placement],
  ...values,
});

describe("published Gantt placement", () => {
  it("preserves planned assignee and exact times while current inputs change", () => {
    const [row] = scheduledWork([task()], schedule(), [
      { id: "published-assignee", name: "Published", image: null },
    ]);
    expect(row.userId).toBe("published-assignee");
    expect(row.assigneeName).toBe("Published");
    expect(row.scheduleStart.toISOString()).toBe(
      new Date(placement.start).toISOString(),
    );
    expect(row.scheduleSegments).toHaveLength(1);
  });
  it("does not reuse legacy dates for unscheduled work after Apply", () => {
    expect(scheduledWork([task()], schedule({ tasks: [] }), [])).toEqual([]);
    expect(
      scheduledWork(
        [task()],
        schedule({
          tasks: [{ ...placement, start: null, end: null, segments: [] }],
        }),
        [],
      ),
    ).toEqual([]);
  });
  it("shows existing legacy dates read-only before the first Apply", () => {
    const [row] = scheduledWork(
      [task()],
      schedule({ legacy: true, tasks: [] }),
      [],
    );
    expect(row.scheduleApplied).toBe(false);
    expect(row.scheduleStart.getDate()).toBe(1);
    expect(row.scheduleSegments).toBeUndefined();
  });

  it("renders preserved completed legacy history as a daily envelope after first Apply", () => {
    const [row] = scheduledWork(
      [task({ status: "done" })],
      schedule({
        tasks: [
          {
            ...placement,
            start: "2026-09-03T00:00:00Z",
            end: "2026-09-03T00:00:00Z",
            segments: [],
          },
        ],
      }),
      [],
    );
    expect(row.scheduleApplied).toBe(false);
    expect(row.scheduleSegments).toBeUndefined();
    expect(row.userId).toBe("published-assignee");
  });

  it("never schedules Features and retains Bug identity", () => {
    expect(scheduledWork([task({ type: "feature" })], schedule(), [])).toEqual(
      [],
    );
    expect(scheduledWork([task({ type: "bug" })], schedule(), [])[0].type).toBe(
      "bug",
    );
  });
});
