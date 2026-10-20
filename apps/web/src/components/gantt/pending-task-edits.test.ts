import { parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import type { ScheduledTask } from "./gantt-types";
import {
  applyPendingEdit,
  classifyEdit,
  type PendingTaskEdit,
  pendingEditLanded,
} from "./pending-task-edits";
import { toIsoDay } from "./timeline";

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
  featureId: "checkout",
  scheduleStart: day("2026-09-01"),
  scheduleEnd: day("2026-09-03"),
};

const pending: PendingTaskEdit = {
  start: day("2026-09-04"),
  end: day("2026-09-06"),
  userId: "bob",
  featureId: "checkout",
  seq: 1,
  assigneeName: "Bob",
  assigneeImage: null,
  hasStartDate: true,
  hasDueDate: true,
};

describe("classifyEdit", () => {
  it("tells date changes and assignee changes apart", () => {
    const sameDates = {
      start: task.scheduleStart,
      end: task.scheduleEnd,
      featureId: "checkout",
    };
    expect(classifyEdit(task, { ...sameDates, userId: "alice" })).toEqual({
      dates: false,
      assignee: false,
      milestone: false,
    });
    expect(classifyEdit(task, { ...sameDates, userId: "bob" })).toEqual({
      dates: false,
      assignee: true,
      milestone: false,
    });
    expect(
      classifyEdit(task, {
        start: day("2026-09-02"),
        end: day("2026-09-04"),
        userId: "alice",
        featureId: "checkout",
      }),
    ).toEqual({
      dates: true,
      assignee: false,
      milestone: false,
    });
    expect(
      classifyEdit(task, {
        start: task.scheduleStart,
        end: day("2026-09-05"),
        userId: null,
        featureId: "checkout",
      }),
    ).toEqual({
      dates: true,
      assignee: true,
      milestone: false,
    });
  });

  it("changes milestone membership while preserving Feature context", () => {
    const sameDates = {
      start: task.scheduleStart,
      end: task.scheduleEnd,
      userId: "alice",
      featureId: "billing",
      milestoneId: "m",
    };
    expect(classifyEdit(task, sameDates)).toEqual({
      dates: false,
      assignee: false,
      milestone: true,
    });
  });

  it("compares calendar days, not instants", () => {
    expect(
      classifyEdit(task, {
        start: parseISO("2026-09-01T15:30"),
        end: parseISO("2026-09-03T08:00"),
        userId: "alice",
        featureId: "checkout",
      }).dates,
    ).toBe(false);
  });

  it("treats a missing assignee and an empty one alike", () => {
    expect(
      classifyEdit(
        { ...task, userId: "" },
        {
          start: task.scheduleStart,
          end: task.scheduleEnd,
          userId: null,
          featureId: "checkout",
        },
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
      startDate: toIsoDay(pending.start),
      dueDate: toIsoDay(pending.end),
    });
  });

  it("shows milestone changes while preserving the Feature", () => {
    expect(
      applyPendingEdit(task, {
        ...pending,
        featureId: "billing",
        milestoneId: "m",
      }).milestoneId,
    ).toBe("m");
    expect(
      applyPendingEdit(task, { ...pending, milestoneId: null }).milestoneId,
    ).toBeNull();
  });

  it("carries which date fields the task will have once saved", () => {
    expect(
      applyPendingEdit(task, { ...pending, hasStartDate: false }),
    ).toMatchObject({ startDate: null, dueDate: toIsoDay(pending.end) });
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

  it("waits for the milestone as well", () => {
    const landed = {
      ...task,
      userId: "bob",
      scheduleStart: pending.start,
      scheduleEnd: pending.end,
    };
    const moved = { ...pending, milestoneId: "m" };
    expect(pendingEditLanded(landed, moved)).toBe(false);
    expect(pendingEditLanded({ ...landed, milestoneId: "m" }, moved)).toBe(
      true,
    );
    expect(
      pendingEditLanded(
        { ...landed, featureId: undefined },
        { ...pending, featureId: null },
      ),
    ).toBe(true);
  });
});
