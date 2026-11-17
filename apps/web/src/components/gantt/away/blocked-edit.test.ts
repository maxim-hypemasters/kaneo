import { describe, expect, it } from "vite-plus/test";
import type { AwayDaysByUser } from "@/lib/time-off/away-days";
import type {
  GanttTaskEdit,
  ScheduledLeaf,
  ScheduledMilestone,
} from "../gantt-types";
import { blockedEditDay } from "./blocked-edit";

const day = (date: number) => new Date(2027, 0, date);
const iso = (date: number) => `2027-01-${String(date).padStart(2, "0")}`;
const awayOn = (userId: string, ...dates: number[]): AwayDaysByUser =>
  new Map([
    [userId, new Map(dates.map((date) => [iso(date), { kind: "away" }]))],
  ]);

// Ann's task, Mon Jan 4 to Fri Jan 8, dates set by hand.
const manual = {
  id: "t1",
  entityKind: "task",
  userId: "ann",
  startDate: iso(4),
  dueDate: iso(8),
  milestoneId: null,
  featureId: null,
  scheduleStart: day(4),
  scheduleEnd: day(8),
  scheduleApplied: false,
} as unknown as ScheduledLeaf;
const dueOnly = {
  ...manual,
  startDate: null,
  scheduleStart: day(8),
} as ScheduledLeaf;
const startOnly = {
  ...manual,
  dueDate: null,
  scheduleEnd: day(4),
} as ScheduledLeaf;
const planned = { ...manual, scheduleApplied: true } as ScheduledLeaf;
// Planned for ann, then reassigned to bob before the next Apply: the bar
// stays in ann's lane.
const reassigned = { ...planned, taskUserId: "bob" } as ScheduledLeaf;

const edit = (
  task: ScheduledLeaf,
  overrides: Partial<GanttTaskEdit> = {},
): GanttTaskEdit => ({
  start: task.scheduleStart,
  end: task.scheduleEnd,
  userId: task.userId,
  featureId: null,
  milestoneId: null,
  ...overrides,
});

describe("blockedEditDay", () => {
  it.each([
    [
      "an exact end on a day away",
      manual,
      edit(manual, { end: day(12), exact: true }),
      awayOn("ann", 12),
      iso(12),
    ],
    [
      "an exact start on a day away",
      manual,
      edit(manual, { start: day(1), exact: true }),
      awayOn("ann", 1),
      iso(1),
    ],
    [
      "a moved due date of due-only work",
      dueOnly,
      edit(dueOnly, { start: day(12), end: day(12) }),
      awayOn("ann", 12),
      iso(12),
    ],
    [
      "a moved start date of start-only work",
      startOnly,
      edit(startOnly, { start: day(6), end: day(6) }),
      awayOn("ann", 6),
      iso(6),
    ],
    [
      "planned work resized onto a day away",
      planned,
      edit(planned, { end: day(11), exact: true }),
      awayOn("ann", 11),
      iso(11),
    ],
    [
      "a lane drop onto someone away on the unchanged start",
      manual,
      edit(manual, { userId: "bo" }),
      awayOn("bo", 4),
      iso(4),
    ],
    [
      "a start set where there was none",
      dueOnly,
      edit(dueOnly, { end: day(11), exact: true }),
      awayOn("ann", 8),
      iso(8),
    ],
  ])("blocks %s", (_name, task, change, away, date) => {
    expect(blockedEditDay(task, change, away)).toEqual({
      userId: change.userId,
      date,
    });
  });

  it.each([
    [
      "a day away in the middle of the span",
      manual,
      edit(manual, { start: day(5), end: day(9) }),
      awayOn("ann", 7),
    ],
    [
      "an end resize while the unchanged start is a day away",
      manual,
      edit(manual, { end: day(7), exact: true }),
      awayOn("ann", 4),
    ],
    [
      "a move of planned work (the server lays it out around the days)",
      planned,
      edit(planned, { start: day(11), end: day(15) }),
      awayOn("ann", 11, 15),
    ],
    [
      "a start the due-only work doesn't have",
      dueOnly,
      edit(dueOnly, { start: day(12), end: day(12) }),
      awayOn("ann", 11),
    ],
    [
      "unassigned work",
      manual,
      edit(manual, { userId: null, end: day(12), exact: true }),
      awayOn("ann", 12),
    ],
    [
      "a change of milestone only",
      manual,
      edit(manual, { milestoneId: "m2" }),
      awayOn("ann", 4, 8),
    ],
    [
      "a lane drop onto someone away on other days",
      manual,
      edit(manual, { userId: "bo" }),
      awayOn("bo", 5, 6, 7),
    ],
  ])("allows %s", (_name, task, change, away) => {
    expect(blockedEditDay(task, change, away)).toBeNull();
  });

  describe("planned work set by hand after a reassignment", () => {
    // Mirrors availabilityChecks: the work goes back to bob, so both of its
    // dates are checked for him.
    it("checks both dates for the task's own assignee", () => {
      const resize = edit(reassigned, { end: day(11), exact: true });
      expect(blockedEditDay(reassigned, resize, awayOn("bob", 4))).toEqual({
        userId: "bob",
        date: iso(4),
      });
      expect(blockedEditDay(reassigned, resize, awayOn("bob", 11))).toEqual({
        userId: "bob",
        date: iso(11),
      });
    });

    it("ignores the planned assignee's days away", () => {
      expect(
        blockedEditDay(
          reassigned,
          edit(reassigned, { end: day(11), exact: true }),
          awayOn("ann", 4, 11),
        ),
      ).toBeNull();
    });

    it("checks only the changed date when the planned assignee is the task's own", () => {
      const own = { ...planned, taskUserId: "ann" } as ScheduledLeaf;
      const resize = edit(own, { end: day(11), exact: true });
      expect(blockedEditDay(own, resize, awayOn("ann", 4))).toBeNull();
      expect(blockedEditDay(own, resize, awayOn("ann", 11))).toEqual({
        userId: "ann",
        date: iso(11),
      });
    });

    it("still lets the server lay a moved bar out around the days", () => {
      expect(
        blockedEditDay(
          reassigned,
          edit(reassigned, { start: day(11), end: day(15) }),
          awayOn("bob", 11, 15),
        ),
      ).toBeNull();
    });
  });

  it("never blocks a milestone", () => {
    const milestone = {
      ...manual,
      entityKind: "milestone",
    } as unknown as ScheduledMilestone;
    expect(
      blockedEditDay(
        milestone,
        edit(manual, { end: day(12), exact: true }),
        awayOn("ann", 12),
      ),
    ).toBeNull();
  });
});
