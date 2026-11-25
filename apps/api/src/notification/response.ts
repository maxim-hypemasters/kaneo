import { responseTimestamp, z } from "../openapi";
import { taskTypeSchema } from "../task/response";

export const notificationSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string().nullable(),
    content: z.string().nullable().openapi({
      description:
        "Free-text body. Null for generated notifications, whose text the client renders from type and eventData.",
    }),
    type: z.string().openapi({
      description:
        "One of: info, task_created, workspace_created, task_status_changed, task_assignee_changed, time_entry_created, due_date_reminder, task_overdue, task_mention, task_comment, task_triage_new (new work waiting in Triage), task_triage_accepted, task_triage_declined (eventData may carry reason), time_off_requested, time_off_approved, time_off_declined, time_off_member_away, time_off_holiday_calendar_requested, time_off_holiday_calendar_approved, time_off_holiday_calendar_declined, document_mention (mentioned in a comment on a project page or Feature document), document_comment_reply (a reply in a document comment thread you started or replied in).",
    }),
    eventData: z.unknown().openapi({
      description:
        "Type-specific payload, e.g. { taskTitle, oldStatus, newStatus, projectId, workspaceId }. Time off notifications carry ids, names, dates and the working-day count, never the time off type or note. Holiday calendar request notifications carry ids and names only, never the country or region. Document comment notifications carry { documentKind (page or feature), documentId, documentTitle, featureId, threadId, commentId, actorId, actorName, commentPreview, quote, projectId, workspaceId }.",
    }),
    isRead: z.boolean().nullable(),
    resourceId: z.string().nullable().openapi({
      description:
        "The id of the task, workspace, project page or Feature document the notification points at.",
    }),
    resourceType: z.string().nullable().openapi({
      description:
        "`task`, `workspace`, `project_document` or `feature_document`.",
    }),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("Notification");

export const notificationListSchema = z.array(
  notificationSchema
    .extend({
      taskType: taskTypeSchema.nullable().openapi({
        description:
          "The type of the Feature, Task or Bug a task notification points at. Null for notifications without a task, such as workspace notifications.",
      }),
    })
    .openapi("NotificationListItem"),
);

export const bulkResultSchema = z
  .object({ success: z.boolean() })
  .openapi("NotificationBulkResult");
