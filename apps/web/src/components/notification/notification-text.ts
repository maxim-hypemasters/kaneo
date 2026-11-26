import { getStatusLabel } from "@/lib/i18n/domain";
import { formatReleaseRange } from "@/lib/releases/release-date";
import type { Notification } from "@/types/notification";

export function getEventDataRecord(
  eventData: unknown,
): Record<string, unknown> | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }

  return eventData as Record<string, unknown>;
}

function getReminderLeadTime(
  eventData: Record<string, unknown>,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const minutes = Number(eventData.leadTimeMinutes ?? 1440);
  if (minutes % 1440 === 0) {
    return t("notifications:reminderLeadTime.days", {
      count: minutes / 1440,
    });
  }
  if (minutes % 60 === 0) {
    return t("notifications:reminderLeadTime.hours", {
      count: minutes / 60,
    });
  }
  return t("notifications:reminderLeadTime.minutes", { count: minutes });
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function nameOr(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

// Time off notifications carry ids, names, dates and the weekday count only;
// holiday calendar requests carry ids and names, never the country or region.
// Names fall back to "Someone" for deleted accounts.
function getTimeOffValues(
  eventData: Record<string, unknown>,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const startDate = String(eventData.startDate ?? "");
  const endDate = String(eventData.endDate ?? "");
  const someone = t("common:people.someone");
  return {
    range:
      ISO_DAY.test(startDate) && ISO_DAY.test(endDate)
        ? formatReleaseRange(startDate, endDate)
        : "",
    requesterName: nameOr(eventData.requesterName, someone),
    deciderName: nameOr(eventData.deciderName, someone),
    userName: nameOr(eventData.userName, someone),
  };
}

export function getNotificationTitle(
  notification: Notification,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const eventData = getEventDataRecord(notification.eventData);
  if (eventData) {
    switch (notification.type) {
      case "task_created":
        return t("notifications:events.task_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "workspace_created":
        return t("notifications:events.workspace_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_status_changed":
        return t("notifications:events.task_status_changed.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_assignee_changed":
        return t("notifications:events.task_assignee_changed.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "time_entry_created":
        return t("notifications:events.time_entry_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_mention":
        return t("notifications:events.task_mention.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "test_case_mention":
        return t("notifications:events.test_case_mention.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_comment":
        return t("notifications:events.task_comment.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "document_mention":
      case "document_comment_reply":
        return t(
          // A mention in the document's own text comes with no comment.
          notification.type === "document_mention" && !eventData.commentId
            ? "notifications:events.document_mention.titleInDocument"
            : `notifications:events.${notification.type}.title`,
          {
            ...eventData,
            actorName: nameOr(eventData.actorName, t("common:people.someone")),
            defaultValue: notification.title ?? notification.type,
          },
        );
      case "due_date_reminder":
        return t("notifications:events.due_date_reminder.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_overdue":
        return t("notifications:events.task_overdue.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_triage_new":
      case "task_triage_accepted":
      case "task_triage_declined":
        return t(`notifications:events.${notification.type}.title`, {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "time_off_requested":
        return t("notifications:events.time_off_requested.title", {
          ...eventData,
          ...getTimeOffValues(eventData, t),
          defaultValue: notification.title ?? notification.type,
        });
      case "time_off_approved":
        return t("notifications:events.time_off_approved.title", {
          ...eventData,
          ...getTimeOffValues(eventData, t),
          defaultValue: notification.title ?? notification.type,
        });
      case "time_off_declined":
        return t("notifications:events.time_off_declined.title", {
          ...eventData,
          ...getTimeOffValues(eventData, t),
          defaultValue: notification.title ?? notification.type,
        });
      case "time_off_member_away":
        return t("notifications:events.time_off_member_away.title", {
          ...eventData,
          ...getTimeOffValues(eventData, t),
          defaultValue: notification.title ?? notification.type,
        });
      case "time_off_holiday_calendar_requested":
        return t(
          "notifications:events.time_off_holiday_calendar_requested.title",
          {
            ...eventData,
            ...getTimeOffValues(eventData, t),
            defaultValue: notification.title ?? notification.type,
          },
        );
      case "time_off_holiday_calendar_approved":
        return t(
          "notifications:events.time_off_holiday_calendar_approved.title",
          {
            ...eventData,
            ...getTimeOffValues(eventData, t),
            defaultValue: notification.title ?? notification.type,
          },
        );
      case "time_off_holiday_calendar_declined":
        return t(
          "notifications:events.time_off_holiday_calendar_declined.title",
          {
            ...eventData,
            ...getTimeOffValues(eventData, t),
            defaultValue: notification.title ?? notification.type,
          },
        );
      default:
        break;
    }
  }

  return notification.title ?? notification.type;
}

export function getNotificationContent(
  notification: Notification,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const eventData = getEventDataRecord(notification.eventData);
  if (eventData) {
    switch (notification.type) {
      case "task_created":
        return t("notifications:events.task_created.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "workspace_created":
        return t("notifications:events.workspace_created.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "task_triage_new":
      case "task_triage_accepted":
        return t(`notifications:events.${notification.type}.content`, {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "task_triage_declined":
        return t(
          eventData.reason
            ? "notifications:events.task_triage_declined.contentWithReason"
            : "notifications:events.task_triage_declined.content",
          { ...eventData, defaultValue: notification.content ?? "" },
        );
      case "task_status_changed":
        return t("notifications:events.task_status_changed.content", {
          ...eventData,
          oldStatus: getStatusLabel(String(eventData.oldStatus ?? "")),
          newStatus: getStatusLabel(String(eventData.newStatus ?? "")),
          defaultValue: notification.content ?? "",
        });
      case "task_assignee_changed":
        return t("notifications:events.task_assignee_changed.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "time_entry_created":
        return eventData.taskTitle
          ? t("notifications:events.time_entry_created.contentWithTask", {
              ...eventData,
              defaultValue: notification.content ?? "",
            })
          : t("notifications:events.time_entry_created.contentWithoutTask", {
              ...eventData,
              defaultValue: notification.content ?? "",
            });
      case "task_mention":
        return t("notifications:events.task_mention.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "test_case_mention":
        return t("notifications:events.test_case_mention.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "task_comment":
        return t("notifications:events.task_comment.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "document_mention":
      case "document_comment_reply":
        return t(
          eventData.commentPreview
            ? `notifications:events.${notification.type}.contentWithPreview`
            : `notifications:events.${notification.type}.content`,
          {
            ...eventData,
            documentTitle: nameOr(
              eventData.documentTitle,
              t("tasks:projectHome.documents.untitled"),
            ),
            defaultValue: notification.content ?? "",
          },
        );
      case "due_date_reminder":
        return t("notifications:events.due_date_reminder.content", {
          ...eventData,
          leadTime: getReminderLeadTime(eventData, t),
          defaultValue: notification.content ?? "",
        });
      case "task_overdue":
        return t("notifications:events.task_overdue.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "time_off_requested":
        return t("notifications:events.time_off_requested.content", {
          ...eventData,
          ...getTimeOffValues(eventData, t),
          count: Number(eventData.days) || 0,
          defaultValue: notification.content ?? "",
        });
      case "time_off_approved":
        return t("notifications:events.time_off_approved.content", {
          ...eventData,
          ...getTimeOffValues(eventData, t),
          count: Number(eventData.days) || 0,
          defaultValue: notification.content ?? "",
        });
      case "time_off_declined":
        return t("notifications:events.time_off_declined.content", {
          ...eventData,
          ...getTimeOffValues(eventData, t),
          count: Number(eventData.days) || 0,
          defaultValue: notification.content ?? "",
        });
      case "time_off_member_away":
        return t("notifications:events.time_off_member_away.content", {
          ...eventData,
          ...getTimeOffValues(eventData, t),
          defaultValue: notification.content ?? "",
        });
      case "time_off_holiday_calendar_requested":
        return t(
          "notifications:events.time_off_holiday_calendar_requested.content",
          {
            ...eventData,
            ...getTimeOffValues(eventData, t),
            defaultValue: notification.content ?? "",
          },
        );
      case "time_off_holiday_calendar_approved":
        return t(
          "notifications:events.time_off_holiday_calendar_approved.content",
          {
            ...eventData,
            ...getTimeOffValues(eventData, t),
            defaultValue: notification.content ?? "",
          },
        );
      case "time_off_holiday_calendar_declined":
        return t(
          "notifications:events.time_off_holiday_calendar_declined.content",
          {
            ...eventData,
            ...getTimeOffValues(eventData, t),
            defaultValue: notification.content ?? "",
          },
        );
      default:
        break;
    }
  }

  return notification.content ?? "";
}
