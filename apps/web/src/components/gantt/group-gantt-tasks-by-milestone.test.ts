import { describe, expect, it } from "vite-plus/test";
import type { GanttMilestoneRecord, ScheduledLeaf } from "./gantt-types";
import {
  canDropIntoMilestone,
  groupGanttTasksByMilestone,
} from "./group-gantt-tasks-by-milestone";
import { scheduledMilestones } from "./scheduled-milestones";

const definition = (
  id: string,
  extra: Partial<GanttMilestoneRecord> = {},
): GanttMilestoneRecord => ({
  id,
  featureId: "feature",
  featureTitle: "Knowledge",
  title: id,
  projectId: "project",
  position: 0,
  leadId: null,
  status: "planned",
  priority: "no-priority",
  releaseId: null,
  progress: { total: 0, started: 0, completed: 0 },
  ...extra,
});
const task = (
  id: string,
  milestoneId: string | null,
  featureId: string | null = "feature",
): ScheduledLeaf => ({
  id,
  title: id,
  type: "task",
  featureId,
  milestoneId,
  projectId: "project",
  number: 1,
  description: null,
  status: "to-do",
  priority: "low",
  startDate: "2026-10-01",
  dueDate: "2026-10-03",
  scheduleStart: new Date(2026, 9, 1),
  scheduleEnd: new Date(2026, 9, 3),
  position: 0,
  createdAt: "",
  userId: null,
  assigneeId: null,
  assigneeName: null,
});

describe("milestone Gantt lanes", () => {
  it("retains empty and undated definitions in manual order, with unassigned last", () => {
    const definitions = [
      definition("later", { position: 2 }),
      definition("first", { position: 1 }),
    ];
    const lanes = groupGanttTasksByMilestone(
      [task("linked", "later"), task("loose", null)],
      definitions,
      "No milestone",
      "Unknown",
    );
    expect(lanes.map((lane) => lane.key)).toEqual([
      "milestone:first",
      "milestone:later",
      "no-milestone",
    ]);
    expect(lanes[0].milestone).toBeNull();
    expect(lanes[1].tasks.map((item) => item.id)).toEqual(["linked"]);
    expect(lanes[1].name).toBe("Knowledge · later");
    expect(lanes[2].tasks.map((item) => item.id)).toEqual(["loose"]);
  });
  it("uses a milestone's explicit dates rather than its linked work's extent", () => {
    const record = definition("first", {
      startDate: "2026-10-10",
      endDate: "2026-10-20",
    });
    const [lane] = groupGanttTasksByMilestone(
      [...scheduledMilestones([record]), task("linked", "first")],
      [record],
      "None",
      "Unknown",
    );
    expect(lane.milestone?.scheduleStart).toEqual(new Date(2026, 9, 10));
    expect(lane.start).toEqual(new Date(2026, 9, 1));
  });
  it("keeps unresolved assignments visible but rejects drops into them", () => {
    const [lane] = groupGanttTasksByMilestone(
      [task("orphan", "missing")],
      [],
      "None",
      "Unknown",
    );
    expect(lane.tasks).toHaveLength(1);
    expect(lane.droppable).toBe(false);
  });
  it("only accepts leaf work from the same Feature and allows clearing", () => {
    const target = { milestoneId: "m", featureId: "feature", droppable: true };
    expect(canDropIntoMilestone(task("same", null), target)).toBe(true);
    expect(
      canDropIntoMilestone(task("other", null, "other-feature"), target),
    ).toBe(false);
    expect(canDropIntoMilestone(task("none", null, null), target)).toBe(false);
    expect(
      canDropIntoMilestone(task("clear", "m"), {
        ...target,
        milestoneId: null,
      }),
    ).toBe(true);
    expect(
      canDropIntoMilestone(
        scheduledMilestones([definition("m", { startDate: "2026-10-01" })])[0],
        target,
      ),
    ).toBe(false);
  });
});

describe("scheduled milestone items", () => {
  it("distinguishes keys from task IDs and uses the lead independently", () => {
    const record = definition("shared", {
      leadId: "lead",
      startDate: "2026-10-10",
      endDate: "2026-10-20",
    });
    const [item] = scheduledMilestones(
      [record],
      [{ id: "lead", name: "Milestone lead" }],
    );
    expect(item.id).toBe("milestone:shared");
    expect(item.milestone.id).toBe("shared");
    expect(item.assigneeName).toBe("Milestone lead");
    expect(item.title).toBe("Knowledge · shared");
  });
  it("does not fabricate a bar for undated milestones and supports one date", () => {
    const items = scheduledMilestones([
      definition("undated"),
      definition("end-only", { endDate: "2026-10-20" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].scheduleStart).toEqual(items[0].scheduleEnd);
  });
});
