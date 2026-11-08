import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskTable,
  userTable,
  workspaceTable,
} from "../../database/schema";
import { type ChatSubject, chatSubject } from "../chat-subject";
import type {
  PluginContext,
  TaskCommentCreatedEvent,
  TaskCreatedEvent,
  TaskDescriptionChangedEvent,
  TaskPriorityChangedEvent,
  TaskStatusChangedEvent,
  TaskTitleChangedEvent,
} from "../types";
import { postToMattermost } from "./client";
import type { MattermostConfig, MattermostEventKey } from "./config";
import { normalizeMattermostConfig } from "./config";

type MattermostEventData = {
  subject: ChatSubject;
  taskTitle: string;
  taskNumber: number | null;
  projectName: string;
  taskUrl: string | null;
  actorName: string | null;
  status: string | null;
  priority: string | null;
};

function isEnabled(config: MattermostConfig, key: MattermostEventKey): boolean {
  return config.events?.[key] ?? false;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toSentenceCase(value: string | null): string {
  if (!value) return "Unknown";
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

async function getMattermostEventData(
  taskId: string,
  projectId: string,
  userId: string | null,
): Promise<MattermostEventData | null> {
  const [taskRow] = await db
    .select({
      title: taskTable.title,
      type: taskTable.type,
      number: taskTable.number,
      status: taskTable.status,
      priority: taskTable.priority,
      projectName: projectTable.name,
      projectId: projectTable.id,
      workspaceId: workspaceTable.id,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .innerJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(and(eq(taskTable.id, taskId), eq(projectTable.id, projectId)))
    .limit(1);

  if (!taskRow) {
    return null;
  }

  const [user] = userId
    ? await db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1)
    : [];

  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";
  const taskUrl = `${clientUrl}/dashboard/workspace/${taskRow.workspaceId}/project/${taskRow.projectId}/task/${taskId}`;

  return {
    subject: chatSubject(taskRow.type),
    taskTitle: taskRow.title,
    taskNumber: taskRow.number,
    projectName: taskRow.projectName,
    taskUrl,
    actorName: user?.name ?? null,
    status: taskRow.status,
    priority: taskRow.priority,
  };
}

async function sendMattermostMessage(
  config: MattermostConfig,
  title: string,
  body: string,
  data: MattermostEventData,
): Promise<void> {
  const { subject } = data;
  const issueKey =
    data.taskNumber !== null
      ? `#${data.taskNumber}`
      : `${subject.label} update`;
  const attachmentTitle = `${escapeText(issueKey)} ${escapeText(data.taskTitle)}`;

  await postToMattermost(config.webhookUrl, {
    text: `${title}: ${data.taskTitle}`,
    attachments: [
      {
        color: "#4f46e5",
        title: attachmentTitle,
        title_link: data.taskUrl ?? undefined,
        text: escapeText(body),
        fields: [
          {
            title: "Project",
            value: escapeText(data.projectName),
            short: true,
          },
          ...(subject.showsWorkflow
            ? [
                {
                  title: "Status",
                  value: escapeText(toSentenceCase(data.status)),
                  short: true,
                },
                {
                  title: "Priority",
                  value: escapeText(toSentenceCase(data.priority)),
                  short: true,
                },
              ]
            : []),
          {
            title: "Triggered by",
            value: data.actorName ? escapeText(data.actorName) : "Kaneo",
            short: true,
          },
        ],
      },
    ],
  });
}

export async function handleTaskCreated(
  event: TaskCreatedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeMattermostConfig(context.config as MattermostConfig);
  if (!isEnabled(config, "taskCreated")) return;

  const data = await getMattermostEventData(
    event.taskId,
    event.projectId,
    event.userId,
  );
  if (!data) return;

  await sendMattermostMessage(
    config,
    `New ${data.subject.noun} created`,
    `A new ${data.subject.noun} was added: ${event.title}`,
    data,
  );
}

export async function handleTaskStatusChanged(
  event: TaskStatusChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeMattermostConfig(context.config as MattermostConfig);
  if (!isEnabled(config, "taskStatusChanged")) return;

  const data = await getMattermostEventData(
    event.taskId,
    event.projectId,
    event.userId,
  );
  if (!data) return;

  await sendMattermostMessage(
    config,
    `${data.subject.label} status changed`,
    `${event.title} moved from ${toSentenceCase(event.oldStatus)} to ${toSentenceCase(event.newStatus)}.`,
    data,
  );
}

export async function handleTaskPriorityChanged(
  event: TaskPriorityChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeMattermostConfig(context.config as MattermostConfig);
  if (!isEnabled(config, "taskPriorityChanged")) return;

  const data = await getMattermostEventData(
    event.taskId,
    event.projectId,
    event.userId,
  );
  if (!data) return;

  await sendMattermostMessage(
    config,
    `${data.subject.label} priority changed`,
    `${event.title} changed from ${toSentenceCase(event.oldPriority)} to ${toSentenceCase(event.newPriority)}.`,
    data,
  );
}

export async function handleTaskTitleChanged(
  event: TaskTitleChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeMattermostConfig(context.config as MattermostConfig);
  if (!isEnabled(config, "taskTitleChanged")) return;

  const data = await getMattermostEventData(
    event.taskId,
    event.projectId,
    event.userId,
  );
  if (!data) return;

  await sendMattermostMessage(
    config,
    `${data.subject.label} title changed`,
    `${data.subject.label} renamed from ${truncate(event.oldTitle, 120)} to ${truncate(event.newTitle, 120)}.`,
    data,
  );
}

export async function handleTaskDescriptionChanged(
  event: TaskDescriptionChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeMattermostConfig(context.config as MattermostConfig);
  if (!isEnabled(config, "taskDescriptionChanged")) return;

  const data = await getMattermostEventData(
    event.taskId,
    event.projectId,
    event.userId,
  );
  if (!data) return;

  await sendMattermostMessage(
    config,
    `${data.subject.label} description changed`,
    `The ${data.subject.noun} description was updated${event.newDescription ? `: ${truncate(event.newDescription.replace(/\s+/g, " "), 160)}` : "."}`,
    data,
  );
}

export async function handleTaskCommentCreated(
  event: TaskCommentCreatedEvent,
  context: PluginContext,
): Promise<void> {
  const config = normalizeMattermostConfig(context.config as MattermostConfig);
  if (!isEnabled(config, "taskCommentCreated")) return;

  const data = await getMattermostEventData(
    event.taskId,
    event.projectId,
    event.userId,
  );
  if (!data) return;

  await sendMattermostMessage(
    config,
    `New ${data.subject.noun} comment`,
    truncate(event.comment.replace(/\s+/g, " "), 200),
    data,
  );
}
