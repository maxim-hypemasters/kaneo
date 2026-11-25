import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Notification } from "@/types/notification";
import {
  getNotificationContent,
  getNotificationTitle,
} from "./notification-text";

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === "notifications:reminderLeadTime.days") {
    return `${options?.count} days`;
  }
  if (key === "notifications:events.due_date_reminder.content") {
    return `${options?.taskTitle} is due in ${options?.leadTime}`;
  }
  if (key === "notifications:events.task_comment.title") {
    return `${options?.commenterName} commented on your task`;
  }
  if (key === "notifications:events.task_comment.content") {
    return `New comment on ${options?.taskTitle}: ${options?.commentPreview}`;
  }
  if (key === "notifications:events.test_case_mention.title") {
    return `${options?.mentionerName} mentioned you`;
  }
  if (key === "notifications:events.test_case_mention.content") {
    return `${options?.mentionerName} mentioned you in the test case: ${options?.testCaseTitle}`;
  }
  if (key === "common:people.someone") return "Someone";
  if (key === "notifications:events.time_off_requested.title") {
    return `${options?.requesterName} requested time off`;
  }
  if (key === "notifications:events.time_off_requested.content") {
    return `${options?.range}, ${options?.count} weekdays`;
  }
  if (key === "notifications:events.time_off_approved.content") {
    return `${options?.deciderName} approved ${options?.range} (${options?.count})`;
  }
  if (key === "notifications:events.time_off_declined.content") {
    return `${options?.deciderName} declined ${options?.range} (${options?.count})`;
  }
  if (key === "notifications:events.time_off_member_away.title") {
    return `${options?.userName} has time off`;
  }
  if (key === "notifications:events.time_off_member_away.content") {
    return `Away ${options?.range}`;
  }
  if (
    key === "notifications:events.time_off_holiday_calendar_requested.title"
  ) {
    return `${options?.requesterName} asked to change their public holidays`;
  }
  if (
    key === "notifications:events.time_off_holiday_calendar_declined.content"
  ) {
    return `${options?.deciderName} declined your change`;
  }
  return key;
};

// Intl puts thin spaces around the range dash.
const plain = (text: string) => text.replace(/\s/g, " ");

function notification(
  type: string,
  eventData: Record<string, unknown>,
): Notification {
  return {
    id: "notification-1",
    userId: "user-1",
    title: null,
    content: null,
    type,
    eventData,
    isRead: false,
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
  } as unknown as Notification;
}

describe("notification display content", () => {
  it("renders configured due-date lead times", () => {
    const item = notification("due_date_reminder", {
      taskTitle: "Launch website",
      leadTimeMinutes: 2880,
    });

    expect(getNotificationTitle(item, t)).toBe(
      "notifications:events.due_date_reminder.title",
    );
    expect(getNotificationContent(item, t)).toBe(
      "Launch website is due in 2 days",
    );
  });

  it("renders a mention in a test case comment", () => {
    const item = notification("test_case_mention", {
      testCaseTitle: "Checks out",
      mentionerName: "Mina",
    });

    expect(getNotificationTitle(item, t)).toBe("Mina mentioned you");
    expect(getNotificationContent(item, t)).toBe(
      "Mina mentioned you in the test case: Checks out",
    );
  });

  it("renders comment notifications with their preview", () => {
    const item = notification("task_comment", {
      taskTitle: "Launch website",
      commenterName: "Mina",
      commentPreview: "Ready for review",
    });

    expect(getNotificationTitle(item, t)).toBe("Mina commented on your task");
    expect(getNotificationContent(item, t)).toBe(
      "New comment on Launch website: Ready for review",
    );
  });

  describe("time off", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-14T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const dates = {
      workspaceId: "workspace-1",
      timeOffId: "time-off-1",
      startDate: "2026-11-16",
      endDate: "2026-11-20",
    };

    it("names the requester and counts the weekdays", () => {
      const item = notification("time_off_requested", {
        ...dates,
        requesterId: "user-2",
        requesterName: "Ana Lee",
        days: 5,
      });

      expect(getNotificationTitle(item, t)).toBe("Ana Lee requested time off");
      expect(plain(getNotificationContent(item, t))).toBe(
        "Nov 16 – 20, 5 weekdays",
      );
    });

    it("says who decided", () => {
      const approved = notification("time_off_approved", {
        ...dates,
        days: 5,
        deciderId: "user-3",
        deciderName: "Mina",
      });
      const declined = notification("time_off_declined", {
        ...dates,
        startDate: "2026-12-28",
        endDate: "2027-01-04",
        days: 6,
        deciderId: "user-3",
        deciderName: "Mina",
      });

      expect(getNotificationTitle(approved, t)).toBe(
        "notifications:events.time_off_approved.title",
      );
      expect(plain(getNotificationContent(approved, t))).toBe(
        "Mina approved Nov 16 – 20 (5)",
      );
      expect(plain(getNotificationContent(declined, t))).toBe(
        "Mina declined Dec 28, 2026 – Jan 4, 2027 (6)",
      );
    });

    it("shows who is away and when", () => {
      const item = notification("time_off_member_away", {
        ...dates,
        userId: "user-2",
        userName: "Ana Lee",
      });

      expect(getNotificationTitle(item, t)).toBe("Ana Lee has time off");
      expect(plain(getNotificationContent(item, t))).toBe("Away Nov 16 – 20");
    });

    it("falls back to Someone for a deleted account", () => {
      const item = notification("time_off_member_away", {
        ...dates,
        userId: "user-2",
        userName: null,
      });

      expect(getNotificationTitle(item, t)).toBe("Someone has time off");
    });

    it("names who asked for or decided a holiday calendar change", () => {
      const requested = notification("time_off_holiday_calendar_requested", {
        workspaceId: "workspace-1",
        requestId: "request-1",
        requesterId: "user-2",
        requesterName: "Ana Lee",
      });
      const declined = notification("time_off_holiday_calendar_declined", {
        workspaceId: "workspace-1",
        requestId: "request-1",
        deciderId: "user-3",
        deciderName: null,
      });

      expect(getNotificationTitle(requested, t)).toBe(
        "Ana Lee asked to change their public holidays",
      );
      expect(getNotificationContent(requested, t)).toBe(
        "notifications:events.time_off_holiday_calendar_requested.content",
      );
      expect(getNotificationTitle(declined, t)).toBe(
        "notifications:events.time_off_holiday_calendar_declined.title",
      );
      expect(getNotificationContent(declined, t)).toBe(
        "Someone declined your change",
      );
    });

    it("leaves the range empty instead of failing on bad dates", () => {
      const item = notification("time_off_member_away", {
        workspaceId: "workspace-1",
        userName: "Ana Lee",
        startDate: "soon",
      });

      expect(getNotificationContent(item, t)).toBe("Away ");
    });
  });
});
