import { describe, expect, it } from "vite-plus/test";
import {
  assigneeLaneVisible,
  groupGanttTasks,
  laneKeyForAssignee,
} from "./group-gantt-tasks";
import type { GanttMilestoneRecord, ScheduledLeaf } from "./gantt-types";
import { scheduledMilestones } from "./scheduled-milestones";
const leaf = (id: string, userId: string | null): ScheduledLeaf => ({
  id,
  title: id,
  projectId: "p",
  number: 1,
  description: null,
  status: "to-do",
  priority: null,
  startDate: "2026-10-01",
  dueDate: "2026-10-02",
  scheduleStart: new Date(2026, 9, 1),
  scheduleEnd: new Date(2026, 9, 2),
  position: 0,
  createdAt: "",
  userId,
  assigneeId: userId,
  assigneeName: userId,
});
const options = {
  members: [
    { id: "alice", name: "Alice" },
    { id: "bob", name: "Bob" },
  ],
  membersLoaded: true,
  assigneeFilter: { values: [] as string[], negated: false },
  unassignedLabel: "Unassigned",
  unknownLabel: "Unknown",
};

describe("Gantt assignee and lead lanes", () => {
  it("keeps alphabetical member lanes and unassigned last", () => {
    const lanes = groupGanttTasks([leaf("one", "bob")], options);
    expect(lanes.map((lane) => lane.key)).toEqual([
      "member:alice",
      "member:bob",
      "unassigned",
    ]);
    expect(lanes[0].tasks).toEqual([]);
    expect(lanes[1].tasks.map((task) => task.id)).toEqual(["one"]);
  });
  it("places the milestone under its own lead and preserves linked task assignees", () => {
    const record: GanttMilestoneRecord = {
      id: "m",
      featureId: "F",
      featureTitle: "Knowledge",
      title: "Delivery",
      projectId: "p",
      position: 0,
      leadId: "alice",
      status: "to-do",
      priority: "low",
      releaseId: null,
      startDate: "2026-10-10",
      endDate: "2026-10-20",
      progress: { total: 1, started: 0, completed: 0 },
    };
    const lanes = groupGanttTasks(
      [
        ...scheduledMilestones([record]),
        { ...leaf("work", "bob"), featureId: "F", milestoneId: "m" },
      ],
      options,
    );
    expect(lanes[0].tasks.map((task) => task.id)).toEqual(["milestone:m"]);
    expect(lanes[1].tasks.map((task) => task.id)).toEqual(["work"]);
    expect(lanes[0].start).toEqual(new Date(2026, 9, 10));
    expect(lanes[1].start).toEqual(new Date(2026, 9, 1));
  });
  it("keeps unknown members visible but undroppable", () => {
    const lanes = groupGanttTasks([leaf("former", "former")], options);
    expect(lanes.find((lane) => lane.userId === "former")?.droppable).toBe(
      false,
    );
  });
  it("uses collision-safe keys and handles positive and negated empty-lane filters", () => {
    expect(laneKeyForAssignee("unassigned")).toBe("member:unassigned");
    expect(assigneeLaneVisible(null, { values: [""], negated: false })).toBe(
      true,
    );
    expect(
      assigneeLaneVisible("alice", { values: ["bob"], negated: true }),
    ).toBe(true);
    const lanes = groupGanttTasks([], {
      ...options,
      assigneeFilter: { values: ["alice"], negated: false },
    });
    expect(lanes.map((lane) => lane.userId)).toEqual(["alice"]);
  });
});
