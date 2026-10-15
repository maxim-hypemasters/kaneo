import { parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import type { ScheduledTask } from "./gantt-types";
import {
  applyPendingEdit,
  classifyEdit,
  type PendingTaskEdit,
  pendingEditLanded,
} from "./pending-task-edits";

const day = (value: string) => parseISO(value);

const task: ScheduledTask = {
  id: "task",
  title: "Task",
  number: 1,
  description: null,
  status: "to-do",
  priority: null,
  startDate: "2026-09-01",
  dueDate: "2026-09-03",
  position: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  userId: "alice",
  assigneeId: "alice",
  assigneeName: "Alice",
  assigneeImage: "alice.png",
  projectId: "project",
  scheduleStart: day("2026-09-01"),
  scheduleEnd: day("2026-09-03"),
};

const pending: PendingTaskEdit = {
  start: day("2026-09-04"),
  end: day("2026-09-06"),
  userId: "bob",
  seq: 1,
  assigneeName: "Bob",
  assigneeImage: null,
};

describe("classifyEdit", () => {
  it("tells date changes and assignee changes apart", () => {
    const sameDates = { start: task.scheduleStart, end: task.scheduleEnd };
    expect(classifyEdit(task, { ...sameDates, userId: "alice" })).toEqual({
      dates: false,
      assignee: false,
    });
    expect(classifyEdit(task, { ...sameDates, userId: "bob" })).toEqual({
      dates: false,
      assignee: true,
    });
    expect(
      classifyEdit(task, {
        start: day("2026-09-02"),
        end: day("2026-09-04"),
        userId: "alice",
      }),
    ).toEqual({ dates: true, assignee: false });
    expect(
      classifyEdit(task, {
        start: task.scheduleStart,
        end: day("2026-09-05"),
        userId: null,
      }),
    ).toEqual({ dates: true, assignee: true });
  });

  it("compares calendar days, not instants", () => {
    expect(
      classifyEdit(task, {
        start: parseISO("2026-09-01T15:30"),
        end: parseISO("2026-09-03T08:00"),
        userId: "alice",
      }).dates,
    ).toBe(false);
  });

  it("treats a missing assignee and an empty one alike", () => {
    expect(
      classifyEdit(
        { ...task, userId: "" },
        { start: task.scheduleStart, end: task.scheduleEnd, userId: null },
      ).assignee,
    ).toBe(false);
  });
});

describe("applyPendingEdit", () => {
  it("shows the pending dates and assignee in place of the server's", () => {
    expect(applyPendingEdit(task, pending)).toMatchObject({
      id: "task",
      title: "Task",
      scheduleStart: pending.start,
      scheduleEnd: pending.end,
      userId: "bob",
      assigneeId: "bob",
      assigneeName: "Bob",
      assigneeImage: null,
    });
  });
});

describe("pendingEditLanded", () => {
  it("is true once the server task matches the edit", () => {
    expect(pendingEditLanded(task, pending)).toBe(false);
    expect(
      pendingEditLanded(
        {
          ...task,
          userId: "bob",
          scheduleStart: parseISO("2026-09-04T00:00"),
          scheduleEnd: parseISO("2026-09-06T00:00"),
        },
        pending,
      ),
    ).toBe(true);
  });

  it("waits for the assignee as well as the dates", () => {
    expect(
      pendingEditLanded(
        { ...task, scheduleStart: pending.start, scheduleEnd: pending.end },
        pending,
      ),
    ).toBe(false);
  });
});
