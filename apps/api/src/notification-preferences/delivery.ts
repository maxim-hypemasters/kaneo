import { createHmac } from "node:crypto";
import { sendNotificationEmail } from "@kaneo/email";
import { and, eq } from "drizzle-orm";
import db from "../database";
import {
  notificationTable,
  projectTable,
  taskTable,
  testCaseTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceRuleTable,
  userTable,
  workspaceTable,
} from "../database/schema";
import { isDocumentResourceType } from "../notification/document-resource";
import { canReceiveResourceNotification } from "../notification/resource-access";
import { isTimeOffNotificationType } from "../time-off/time-off-notification-types";
import {
  safeOutboundError,
  sendOutboundRequest,
} from "../utils/outbound-request";
import { buildDocumentUrl } from "./build-document-url";
import { formatDayRange } from "./format-day-range";
import { resolveDocumentContext } from "./resolve-document-context";
import { resolveEmailTask } from "./resolve-email-task";
import { decryptSecret } from "./secrets";

type ResolvedNotificationContext = {
  workspaceId: string;
  workspaceName: string;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  // The page or Feature document a comment notification points at.
  document: {
    id: string;
    kind: "page" | "feature";
    title: string;
    featureId: string | null;
    url: string;
  } | null;
  testCase: { id: string; title: string; url: string } | null;
};

type DeliveryContent = {
  title: string;
  body: string;
};

function getClientUrl() {
  return process.env.KANEO_CLIENT_URL || "http://localhost:5173";
}

function buildTaskUrl(workspaceId: string, projectId: string, taskId: string) {
  return `${getClientUrl()}/dashboard/workspace/${workspaceId}/project/${projectId}/task/${taskId}`;
}

// The Test cases page opens the one its link names.
function buildTestCaseUrl(
  workspaceId: string,
  projectId: string,
  testCaseId: string,
) {
  return `${getClientUrl()}/dashboard/workspace/${workspaceId}/project/${projectId}/test-cases?testCaseId=${encodeURIComponent(testCaseId)}`;
}

function buildTimeOffUrl(workspaceId: string) {
  return `${getClientUrl()}/dashboard/workspace/${workspaceId}/time-off`;
}

function getStringValue(
  data: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

function getNumberValue(
  data: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = data?.[key];
  return typeof value === "number" ? value : null;
}

function eventDayRange(data: Record<string, unknown> | null | undefined) {
  const startDate = getStringValue(data, "startDate");
  const endDate = getStringValue(data, "endDate");
  return startDate && endDate ? formatDayRange(startDate, endDate) : null;
}

// Weekdays minus the member's calendar holidays, so not plain weekdays.
function formatWorkdays(days: number | null) {
  return days === null
    ? null
    : `${days} ${days === 1 ? "working day" : "working days"}`;
}

function formatLeadTime(minutes: number | null) {
  if (!minutes) return "soon";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `in ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `in ${minutes} minutes`;
}

function buildDeliveryContent(notification: {
  type: string;
  content: string | null;
  title: string | null;
  eventData: Record<string, unknown> | null;
}): DeliveryContent {
  if (notification.title && notification.content) {
    return {
      title: notification.title,
      body: notification.content,
    };
  }

  switch (notification.type) {
    case "task_created": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      return {
        title: "New task created",
        body: taskTitle
          ? `A new task was created: ${taskTitle}`
          : "A new task was created in Kaneo.",
      };
    }
    case "task_triage_new": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      return {
        title: "New work to triage",
        body: taskTitle
          ? `${taskTitle} is waiting in Triage.`
          : "New work is waiting in Triage.",
      };
    }
    case "task_triage_accepted": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      return {
        title: "Your report was accepted",
        body: taskTitle
          ? `${taskTitle} was accepted and moved to the board.`
          : "Your report was accepted and moved to the board.",
      };
    }
    case "task_triage_declined": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      const reason = getStringValue(notification.eventData, "reason");
      const declined = taskTitle
        ? `${taskTitle} was declined.`
        : "Your report was declined.";
      return {
        title: "Your report was declined",
        body: reason ? `${declined} Reason: ${reason}` : declined,
      };
    }
    case "workspace_created": {
      const workspaceName = getStringValue(
        notification.eventData,
        "workspaceName",
      );
      return {
        title: "Workspace created",
        body: workspaceName
          ? `Workspace created: ${workspaceName}`
          : "A new workspace was created in Kaneo.",
      };
    }
    case "task_status_changed": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      const oldStatus = getStringValue(notification.eventData, "oldStatus");
      const newStatus = getStringValue(notification.eventData, "newStatus");
      return {
        title: "Task status changed",
        body:
          taskTitle && oldStatus && newStatus
            ? `${taskTitle} moved from ${oldStatus} to ${newStatus}.`
            : "A task status changed in Kaneo.",
      };
    }
    case "task_assignee_changed": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      return {
        title: "Task assigned to you",
        body: taskTitle
          ? `You were assigned to ${taskTitle}.`
          : "A task was assigned to you in Kaneo.",
      };
    }
    case "time_entry_created": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      return {
        title: "Time entry created",
        body: taskTitle
          ? `A time entry was created for ${taskTitle}.`
          : "A time entry was created in Kaneo.",
      };
    }
    case "due_date_reminder": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      const label = formatLeadTime(
        getNumberValue(notification.eventData, "leadTimeMinutes"),
      );
      return {
        title: "Task due soon",
        body: taskTitle
          ? `"${taskTitle}" is due ${label}.`
          : `A task is due ${label}.`,
      };
    }
    case "task_overdue": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      return {
        title: "Task overdue",
        body: taskTitle
          ? `"${taskTitle}" is past its due date.`
          : "A task is past its due date.",
      };
    }
    case "task_mention": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      const mentionerName = getStringValue(
        notification.eventData,
        "mentionerName",
      );
      return {
        title: mentionerName
          ? `${mentionerName} mentioned you`
          : "You were mentioned",
        body: taskTitle
          ? `You were mentioned in ${taskTitle}.`
          : "You were mentioned in a Kaneo task.",
      };
    }
    case "test_case_mention": {
      const testCaseTitle = getStringValue(
        notification.eventData,
        "testCaseTitle",
      );
      const mentionerName = getStringValue(
        notification.eventData,
        "mentionerName",
      );
      return {
        title: mentionerName
          ? `${mentionerName} mentioned you`
          : "You were mentioned",
        body: testCaseTitle
          ? `You were mentioned in the test case ${testCaseTitle}.`
          : "You were mentioned in a Kaneo test case.",
      };
    }
    case "task_comment": {
      const taskTitle = getStringValue(notification.eventData, "taskTitle");
      const commenterName = getStringValue(
        notification.eventData,
        "commenterName",
      );
      return {
        title: commenterName
          ? `${commenterName} commented on your task`
          : "New task comment",
        body: taskTitle
          ? `A new comment was added to ${taskTitle}.`
          : "A new comment was added to a Kaneo task.",
      };
    }
    // Like task comments, the body names the document but leaves the comment
    // text out of email and push messages.
    case "document_mention": {
      const documentTitle = getStringValue(
        notification.eventData,
        "documentTitle",
      );
      const actorName = getStringValue(notification.eventData, "actorName");
      // A mention in the document's own text comes with no comment.
      const where = getStringValue(notification.eventData, "commentId")
        ? "a comment on "
        : "";
      return {
        title: actorName ? `${actorName} mentioned you` : "You were mentioned",
        body: documentTitle
          ? `You were mentioned in ${where}${documentTitle}.`
          : `You were mentioned in ${where}a Kaneo document.`,
      };
    }
    case "document_comment_reply": {
      const documentTitle = getStringValue(
        notification.eventData,
        "documentTitle",
      );
      const actorName = getStringValue(notification.eventData, "actorName");
      return {
        title: actorName
          ? `${actorName} replied to a comment`
          : "New reply to a comment",
        body: documentTitle
          ? `There is a new reply in a comment thread on ${documentTitle}.`
          : "There is a new reply in a comment thread on a Kaneo document.",
      };
    }
    case "time_off_requested": {
      const requesterName = getStringValue(
        notification.eventData,
        "requesterName",
      );
      const range = eventDayRange(notification.eventData);
      const days = formatWorkdays(
        getNumberValue(notification.eventData, "days"),
      );
      return {
        title: requesterName
          ? `${requesterName} requested time off`
          : "Time off requested",
        body: range
          ? `${range}${days ? ` (${days})` : ""} is waiting for your review.`
          : "A time off request is waiting for your review.",
      };
    }
    case "time_off_approved":
    case "time_off_declined": {
      const approved = notification.type === "time_off_approved";
      const deciderName = getStringValue(notification.eventData, "deciderName");
      const range = eventDayRange(notification.eventData);
      const verb = approved ? "approved" : "declined";
      return {
        title: approved ? "Time off approved" : "Time off declined",
        body: range
          ? `${deciderName ?? "An approver"} ${verb} your time off for ${range}.`
          : `Your time off request was ${verb}.`,
      };
    }
    case "time_off_member_away": {
      const userName = getStringValue(notification.eventData, "userName");
      const range = eventDayRange(notification.eventData);
      return {
        title: userName ? `${userName} has time off` : "Teammate time off",
        body: range
          ? `${userName ?? "A teammate"} is away ${range}.`
          : `${userName ?? "A teammate"} has approved time off.`,
      };
    }
    // Calendar request notices never name the country or region.
    case "time_off_holiday_calendar_requested": {
      const requesterName = getStringValue(
        notification.eventData,
        "requesterName",
      );
      return {
        title: requesterName
          ? `${requesterName} asked to change their public holidays`
          : "Public holiday change requested",
        body: "A public holiday calendar change is waiting for your review.",
      };
    }
    case "time_off_holiday_calendar_approved":
    case "time_off_holiday_calendar_declined": {
      const approved =
        notification.type === "time_off_holiday_calendar_approved";
      const deciderName = getStringValue(notification.eventData, "deciderName");
      const verb = approved ? "approved" : "declined";
      return {
        title: approved
          ? "Public holiday change approved"
          : "Public holiday change declined",
        body: `${deciderName ?? "An approver"} ${verb} your public holiday calendar change.`,
      };
    }
    default:
      return {
        title: notification.title ?? "New Kaneo notification",
        body: notification.content ?? "You have a new notification in Kaneo.",
      };
  }
}

async function resolveNotificationContext(notification: {
  resourceType: string | null;
  resourceId: string | null;
  eventData: unknown;
}): Promise<ResolvedNotificationContext | null> {
  if (!notification.resourceType || !notification.resourceId) {
    return null;
  }

  if (notification.resourceType === "task") {
    const [task] = await db
      .select({
        taskId: taskTable.id,
        taskTitle: taskTable.title,
        projectId: projectTable.id,
        projectName: projectTable.name,
        workspaceId: workspaceTable.id,
        workspaceName: workspaceTable.name,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .innerJoin(
        workspaceTable,
        eq(projectTable.workspaceId, workspaceTable.id),
      )
      .where(eq(taskTable.id, notification.resourceId))
      .limit(1);

    if (!task) {
      return null;
    }

    return {
      workspaceId: task.workspaceId,
      workspaceName: task.workspaceName,
      projectId: task.projectId,
      projectName: task.projectName,
      taskId: task.taskId,
      taskTitle: task.taskTitle,
      taskUrl: buildTaskUrl(task.workspaceId, task.projectId, task.taskId),
      document: null,
      testCase: null,
    };
  }

  if (isDocumentResourceType(notification.resourceType)) {
    const resolved = await resolveDocumentContext(
      notification.resourceType,
      notification.resourceId,
    );
    if (!resolved) {
      return null;
    }

    const eventData =
      notification.eventData && typeof notification.eventData === "object"
        ? (notification.eventData as Record<string, unknown>)
        : null;
    return {
      workspaceId: resolved.workspaceId,
      workspaceName: resolved.workspaceName,
      projectId: resolved.projectId,
      projectName: resolved.projectName,
      taskId: null,
      taskTitle: null,
      taskUrl: null,
      testCase: null,
      document: {
        id: resolved.documentId,
        kind: resolved.kind,
        title: resolved.documentTitle,
        featureId: resolved.featureId,
        url: buildDocumentUrl(getClientUrl(), {
          workspaceId: resolved.workspaceId,
          projectId: resolved.projectId,
          documentId: resolved.documentId,
          featureId: resolved.featureId,
          threadId: getStringValue(eventData, "threadId"),
        }),
      },
    };
  }

  if (notification.resourceType === "test_case") {
    const [testCase] = await db
      .select({
        id: testCaseTable.id,
        title: testCaseTable.title,
        projectId: projectTable.id,
        projectName: projectTable.name,
        workspaceId: workspaceTable.id,
        workspaceName: workspaceTable.name,
      })
      .from(testCaseTable)
      .innerJoin(projectTable, eq(testCaseTable.projectId, projectTable.id))
      .innerJoin(
        workspaceTable,
        eq(projectTable.workspaceId, workspaceTable.id),
      )
      .where(eq(testCaseTable.id, notification.resourceId))
      .limit(1);

    if (!testCase) {
      return null;
    }

    return {
      workspaceId: testCase.workspaceId,
      workspaceName: testCase.workspaceName,
      projectId: testCase.projectId,
      projectName: testCase.projectName,
      taskId: null,
      taskTitle: null,
      taskUrl: null,
      document: null,
      testCase: {
        id: testCase.id,
        title: testCase.title,
        url: buildTestCaseUrl(
          testCase.workspaceId,
          testCase.projectId,
          testCase.id,
        ),
      },
    };
  }

  if (notification.resourceType === "workspace") {
    const [workspace] = await db
      .select({
        workspaceId: workspaceTable.id,
        workspaceName: workspaceTable.name,
      })
      .from(workspaceTable)
      .where(eq(workspaceTable.id, notification.resourceId))
      .limit(1);

    if (!workspace) {
      return null;
    }

    return {
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.workspaceName,
      projectId: null,
      projectName: null,
      taskId: null,
      taskTitle: null,
      taskUrl: null,
      document: null,
      testCase: null,
    };
  }

  return null;
}

async function sendNtfyNotification(input: {
  serverUrl: string;
  topic: string;
  token?: string | null;
  title: string;
  body: string;
  clickUrl?: string | null;
}) {
  await sendOutboundRequest(
    `${input.serverUrl.replace(/\/+$/, "")}/${encodeURIComponent(input.topic)}`,
    {
      headers: {
        ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
        ...(input.clickUrl ? { Click: input.clickUrl } : {}),
        Title: input.title,
      },
      body: input.body,
    },
    { publicDestination: true, timeoutMs: 15_000 },
  );
}

async function sendGotifyNotification(input: {
  serverUrl: string;
  token: string;
  title: string;
  body: string;
  clickUrl?: string | null;
}) {
  // Gotify expects the app token in the query string; that can surface in logs, proxies, and browser history, so factor this into Gotify placement and log handling.
  await sendOutboundRequest(
    `${input.serverUrl.replace(/\/+$/, "")}/message?token=${encodeURIComponent(
      input.token,
    )}`,
    {
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        message: input.body,
        priority: 5,
        extras: input.clickUrl
          ? {
              "client::notification": {
                click: {
                  url: input.clickUrl,
                },
              },
              "client::display": {
                contentType: "text/plain",
              },
            }
          : undefined,
      }),
    },
    { publicDestination: true, timeoutMs: 15_000 },
  );
}

async function sendWebhookNotification(input: {
  webhookUrl: string;
  secret?: string | null;
  payload: Record<string, unknown>;
}) {
  const body = JSON.stringify(input.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (input.secret) {
    headers["X-Kaneo-Signature"] = createHmac("sha256", input.secret)
      .update(body)
      .digest("hex");
  }

  await sendOutboundRequest(
    input.webhookUrl,
    { headers, body },
    { publicDestination: true, timeoutMs: 15_000 },
  );
}

export async function deliverNotification(
  notificationId: string,
): Promise<void> {
  const notification = await db.query.notificationTable.findFirst({
    where: eq(notificationTable.id, notificationId),
  });

  if (
    !notification ||
    !(await canReceiveResourceNotification(
      notification.userId,
      notification.resourceId,
      notification.resourceType,
    ))
  ) {
    return;
  }

  const context = await resolveNotificationContext(notification);
  if (!context) {
    console.info("Notification delivery skipped: unresolved context", {
      notificationId,
      notificationTableId: notification.id,
      resourceType: notification.resourceType,
      resourceId: notification.resourceId,
      reason:
        "resolveNotificationContext returned null (missing resource, deleted task, or unsupported resource type)",
    });
    return;
  }

  const [user] = await db
    .select({
      email: userTable.email,
      name: userTable.name,
      locale: userTable.locale,
    })
    .from(userTable)
    .where(eq(userTable.id, notification.userId))
    .limit(1);

  if (!user) {
    return;
  }

  const preference = await db.query.userNotificationPreferenceTable.findFirst({
    where: eq(userNotificationPreferenceTable.userId, notification.userId),
  });

  if (!preference) {
    return;
  }

  const decryptedPreference = {
    ...preference,
    ntfyToken: decryptSecret(preference.ntfyToken),
    gotifyToken: decryptSecret(preference.gotifyToken),
    webhookSecret: decryptSecret(preference.webhookSecret),
  };

  const rule = await db.query.userNotificationWorkspaceRuleTable.findFirst({
    where: and(
      eq(userNotificationWorkspaceRuleTable.userId, notification.userId),
      eq(userNotificationWorkspaceRuleTable.workspaceId, context.workspaceId),
    ),
    with: {
      selectedProjects: true,
    },
  });

  if (!rule?.isActive) {
    return;
  }

  // Time off belongs to the workspace rather than a project, so a rule
  // limited to selected projects still delivers it.
  if (
    rule.projectMode === "selected" &&
    !isTimeOffNotificationType(notification.type) &&
    (!context.projectId ||
      !rule.selectedProjects.some(
        (project) => project.projectId === context.projectId,
      ))
  ) {
    return;
  }

  const content = buildDeliveryContent({
    type: notification.type,
    title: notification.title ?? null,
    content: notification.content ?? null,
    eventData:
      notification.eventData && typeof notification.eventData === "object"
        ? (notification.eventData as Record<string, unknown>)
        : null,
  });

  const actionUrl =
    context.taskUrl ??
    context.document?.url ??
    context.testCase?.url ??
    (isTimeOffNotificationType(notification.type)
      ? buildTimeOffUrl(context.workspaceId)
      : null);

  const webhookPayload = {
    notification: {
      id: notification.id,
      type: notification.type,
      title: content.title,
      content: content.body,
      createdAt: notification.createdAt,
      eventData: notification.eventData,
      resourceId: notification.resourceId,
      resourceType: notification.resourceType,
    },
    workspace: {
      id: context.workspaceId,
      name: context.workspaceName,
    },
    project: context.projectId
      ? {
          id: context.projectId,
          name: context.projectName,
        }
      : null,
    task: context.taskId
      ? {
          id: context.taskId,
          title: context.taskTitle,
          url: context.taskUrl,
        }
      : null,
    document: context.document
      ? {
          id: context.document.id,
          kind: context.document.kind,
          title: context.document.title,
          url: context.document.url,
        }
      : null,
    testCase: context.testCase,
    user: {
      id: notification.userId,
      email: user.email,
      name: user.name,
    },
  };

  const deliveries: Array<Promise<void>> = [];

  if (decryptedPreference.emailEnabled && rule.emailEnabled && user.email) {
    const recipient = user.email;
    deliveries.push(
      (async () => {
        const task = context.taskId
          ? await resolveEmailTask(context.taskId)
          : undefined;
        await sendNotificationEmail(recipient, content.title, {
          title: content.title,
          message: content.body,
          actionUrl,
          locale: user.locale ?? null,
          breadcrumb: context.projectName
            ? `${context.workspaceName} / ${context.projectName}`
            : context.workspaceName,
          task,
          settingsUrl: `${getClientUrl()}/dashboard/settings/account/notifications`,
        });
      })(),
    );
  }

  if (
    decryptedPreference.ntfyEnabled &&
    decryptedPreference.ntfyServerUrl &&
    decryptedPreference.ntfyTopic &&
    rule.ntfyEnabled
  ) {
    deliveries.push(
      sendNtfyNotification({
        serverUrl: decryptedPreference.ntfyServerUrl,
        topic: decryptedPreference.ntfyTopic,
        token: decryptedPreference.ntfyToken,
        title: content.title,
        body: content.body,
        clickUrl: actionUrl,
      }),
    );
  }

  if (
    decryptedPreference.gotifyEnabled &&
    decryptedPreference.gotifyServerUrl &&
    decryptedPreference.gotifyToken &&
    rule.gotifyEnabled
  ) {
    deliveries.push(
      sendGotifyNotification({
        serverUrl: decryptedPreference.gotifyServerUrl,
        token: decryptedPreference.gotifyToken,
        title: content.title,
        body: content.body,
        clickUrl: actionUrl,
      }),
    );
  }

  if (
    decryptedPreference.webhookEnabled &&
    decryptedPreference.webhookUrl &&
    rule.webhookEnabled
  ) {
    deliveries.push(
      sendWebhookNotification({
        webhookUrl: decryptedPreference.webhookUrl,
        secret: decryptedPreference.webhookSecret,
        payload: webhookPayload,
      }),
    );
  }

  const results = await Promise.allSettled(deliveries);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Notification delivery failed", {
        notificationId,
        error: safeOutboundError(result.reason),
      });
    }
  }
}
