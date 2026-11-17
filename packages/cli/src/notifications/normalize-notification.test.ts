import { describe, expect, it } from "vite-plus/test";
import type { RawNotification } from "../api/notifications.js";
import { normalizeNotification } from "./normalize-notification.js";

function raw(overrides: Partial<RawNotification> = {}): RawNotification {
  return {
    id: "n1",
    title: null,
    content: null,
    type: "task_assignee_changed",
    eventData: {
      taskTitle: "Fix login redirect",
      projectId: "p1",
      workspaceId: "ws_1",
    },
    isRead: false,
    resourceId: "t1",
    resourceType: "task",
    createdAt: "2026-10-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeNotification", () => {
  it("writes generated notifications from their type and event data", () => {
    expect(normalizeNotification(raw())).toEqual({
      id: "n1",
      type: "task_assignee_changed",
      title: "Task assigned to you",
      message: "Fix login redirect",
      read: false,
      createdAt: "2026-10-08T10:00:00.000Z",
      workspaceId: "ws_1",
      projectId: "p1",
      taskId: "t1",
      taskTitle: "Fix login redirect",
    });
  });

  it("describes status changes with readable column names", () => {
    const view = normalizeNotification(
      raw({
        type: "task_status_changed",
        eventData: {
          taskTitle: "Ship it",
          oldStatus: "in-progress",
          newStatus: "done",
        },
      }),
    );
    expect(view.title).toBe("Task status changed");
    expect(view.message).toBe('"Ship it" moved from In progress to Done');
  });

  it("names the person behind mentions and comments", () => {
    expect(
      normalizeNotification(
        raw({
          type: "task_comment",
          eventData: {
            taskTitle: "Ship it",
            commenterName: "Grace",
            commentPreview: "Looks good,\nmerging",
          },
        }),
      ),
    ).toMatchObject({
      title: "Grace commented on your task",
      message: "Ship it: Looks good, merging",
    });
    expect(
      normalizeNotification(
        raw({ type: "task_mention", eventData: { taskTitle: "Ship it" } }),
      ).title,
    ).toBe("Someone mentioned you");
  });

  it("describes new work waiting in Triage", () => {
    const view = (eventData: Record<string, unknown>) =>
      normalizeNotification(raw({ type: "task_triage_new", eventData }));
    expect(
      view({
        taskTitle: "Crash on save",
        reporterName: "Grace",
        projectId: "p1",
        workspaceId: "ws_1",
      }),
    ).toMatchObject({
      title: "New work to triage",
      message: 'Grace reported "Crash on save"',
      projectId: "p1",
      taskId: "t1",
    });
    expect(
      view({ taskTitle: "Crash on save", reporterName: null }).message,
    ).toBe("Crash on save");
  });

  it("tells reporters whether their work was accepted or declined", () => {
    expect(
      normalizeNotification(
        raw({
          type: "task_triage_accepted",
          eventData: { taskTitle: "Crash on save", actorName: "Ada" },
        }),
      ),
    ).toMatchObject({
      title: "Ada accepted your report",
      message: "Crash on save",
    });
    expect(
      normalizeNotification(
        raw({
          type: "task_triage_declined",
          eventData: {
            taskTitle: "Crash on save",
            actorName: "Ada",
            reason: "Duplicate of\nKAN-4",
          },
        }),
      ),
    ).toMatchObject({
      title: "Ada declined your report",
      message: "Crash on save: Duplicate of KAN-4",
    });
    expect(
      normalizeNotification(
        raw({
          type: "task_triage_declined",
          eventData: { taskTitle: "Crash on save" },
        }),
      ),
    ).toMatchObject({
      title: "Someone declined your report",
      message: "Crash on save",
    });
  });

  it("formats reminder lead times", () => {
    expect(
      normalizeNotification(
        raw({
          type: "due_date_reminder",
          eventData: { taskTitle: "Ship it", leadTimeMinutes: 120 },
        }),
      ).message,
    ).toBe("Ship it is due in 2 hours");
  });

  it("falls back to the stored title and content", () => {
    expect(
      normalizeNotification(
        raw({
          type: "info",
          title: "Heads up",
          content: "Maintenance tonight",
          eventData: null,
          isRead: null,
          resourceId: null,
          resourceType: null,
        }),
      ),
    ).toEqual({
      id: "n1",
      type: "info",
      title: "Heads up",
      message: "Maintenance tonight",
      read: false,
      createdAt: "2026-10-08T10:00:00.000Z",
      workspaceId: null,
      projectId: null,
      taskId: null,
      taskTitle: null,
    });
  });

  it("names unknown types when there is no title", () => {
    expect(
      normalizeNotification(
        raw({ type: "custom_event", eventData: undefined, resourceType: null }),
      ).title,
    ).toBe("Custom event");
  });

  it("describes time off requests, decisions and absences", () => {
    const timeOff = (type: string, eventData: Record<string, unknown>) =>
      normalizeNotification(
        raw({
          type,
          eventData: {
            workspaceId: "ws_1",
            timeOffId: "to1",
            startDate: "2026-11-16",
            endDate: "2026-11-20",
            ...eventData,
          },
          resourceId: "ws_1",
          resourceType: "workspace",
        }),
      );
    expect(
      timeOff("time_off_requested", { requesterName: "Mia", days: 5 }),
    ).toMatchObject({
      title: "Mia requested time off",
      message: "Nov 16 – 20, 2026 (5 working days)",
      workspaceId: "ws_1",
      projectId: null,
      taskId: null,
    });
    expect(
      timeOff("time_off_requested", {
        requesterName: "Mia",
        endDate: "2026-11-16",
        days: 1,
      }).message,
    ).toBe("Nov 16, 2026 (1 working day)");
    expect(
      timeOff("time_off_approved", { deciderName: "Olga", days: 5 }),
    ).toMatchObject({
      title: "Time off approved",
      message: "Nov 16 – 20, 2026, approved by Olga",
    });
    expect(timeOff("time_off_declined", {})).toMatchObject({
      title: "Time off declined",
      message: "Nov 16 – 20, 2026",
    });
    expect(timeOff("time_off_member_away", { userName: "Mia" })).toMatchObject({
      title: "Mia is away",
      message: "Nov 16 – 20, 2026",
    });
    expect(timeOff("time_off_member_away", { startDate: null })).toMatchObject({
      title: "A teammate is away",
      message: "Dates unavailable",
    });
  });

  it("describes holiday calendar requests and decisions without a calendar", () => {
    const calendar = (type: string, eventData: Record<string, unknown>) =>
      normalizeNotification(
        raw({
          type,
          eventData: { workspaceId: "ws_1", requestId: "hcr1", ...eventData },
          resourceId: "ws_1",
          resourceType: "workspace",
        }),
      );
    expect(
      calendar("time_off_holiday_calendar_requested", {
        requesterId: "u1",
        requesterName: "Mia",
      }),
    ).toMatchObject({
      title: "Mia asked to change their public holidays",
      message: "Waiting for your review",
      workspaceId: "ws_1",
      taskId: null,
    });
    expect(
      calendar("time_off_holiday_calendar_requested", { requesterName: null })
        .title,
    ).toBe("Someone asked to change their public holidays");
    expect(
      calendar("time_off_holiday_calendar_approved", {
        deciderId: "u2",
        deciderName: "Olga",
      }),
    ).toMatchObject({
      title: "Public holiday change approved",
      message: "Approved by Olga",
    });
    expect(
      calendar("time_off_holiday_calendar_declined", { deciderName: null }),
    ).toMatchObject({
      title: "Public holiday change declined",
      message: null,
    });
  });

  it("points workspace notifications at their workspace", () => {
    expect(
      normalizeNotification(
        raw({
          type: "workspace_created",
          eventData: { workspaceName: "Acme Studio" },
          resourceId: "ws_9",
          resourceType: "workspace",
        }),
      ),
    ).toMatchObject({
      workspaceId: "ws_9",
      taskId: null,
      message: 'Your workspace "Acme Studio" has been created',
    });
  });
});
