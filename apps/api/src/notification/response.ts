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
        "One of: info, task_created, workspace_created, task_status_changed, task_assignee_changed, time_entry_created, due_date_reminder, task_overdue, task_mention, task_comment.",
    }),
    eventData: z.unknown().openapi({
      description:
        "Type-specific payload, e.g. { taskTitle, oldStatus, newStatus, projectId, workspaceId }.",
    }),
    isRead: z.boolean().nullable(),
    resourceId: z.string().nullable().openapi({
      description:
        "The id of the task or workspace the notification points at.",
    }),
    resourceType: z.string().nullable().openapi({
      description: "`task` or `workspace`.",
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
