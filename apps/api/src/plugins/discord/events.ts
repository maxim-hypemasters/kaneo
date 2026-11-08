import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  columnTable,
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
import { postToDiscord, sanitizeDiscordContent } from "./client";
import type { DiscordConfig, DiscordEventKey } from "./config";
import { normalizeDiscordConfig } from "./config";

type DiscordEventData = {
  subject: ChatSubject;
  taskTitle: string;
  taskNumber: number | null;
  projectName: string;
  taskUrl: string | null;
  actorName: string | null;
  statusSlug: string;
  columnName: string | null;
  priority: string | null;
};

function isEnabled(config: DiscordConfig, key: DiscordEventKey): boolean {
  return config.events?.[key] ?? false;
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

function redactWebhookUrl(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const token = parts.at(-1) ?? "";
    const maskedToken =
      token.length > 6 ? `${token.slice(0, 2)}…${token.slice(-4)}` : "redacted";
    return `${url.origin}/${parts.slice(0, -1).join("/")}/${maskedToken}`;
  } catch {
    return "redacted";
  }
}

async function getDiscordEventData(
  taskId: string,
  projectId: string,
  userId: string | null,
): Promise<DiscordEventData | null> {
  const taskPromise = db
    .select({
      title: taskTable.title,
      type: taskTable.type,
      number: taskTable.number,
      status: taskTable.status,
      priority: taskTable.priority,
      columnName: columnTable.name,
      projectName: projectTable.name,
      projectId: projectTable.id,
      workspaceId: workspaceTable.id,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .innerJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .leftJoin(
      columnTable,
      and(
        eq(taskTable.columnId, columnTable.id),
        eq(columnTable.projectId, projectTable.id),
      ),
    )
    .where(and(eq(taskTable.id, taskId), eq(projectTable.id, projectId)))
    .limit(1);

  const userPromise = userId
    ? db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1)
    : Promise.resolve([]);

  const [[taskRow], [user]] = await Promise.all([taskPromise, userPromise]);

  if (!taskRow) {
    return null;
  }

  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";
  const taskUrl = `${clientUrl}/dashboard/workspace/${taskRow.workspaceId}/project/${taskRow.projectId}/task/${taskId}`;

  return {
    subject: chatSubject(taskRow.type),
    taskTitle: taskRow.title,
    taskNumber: taskRow.number,
    projectName: taskRow.projectName,
    taskUrl,
    actorName: user?.name ?? null,
    statusSlug: taskRow.status ?? "",
    columnName: taskRow.columnName,
    priority: taskRow.priority,
  };
}

async function sendDiscordMessage(
  config: DiscordConfig,
  title: string,
  body: string,
  data: DiscordEventData,
): Promise<void> {
  const { subject } = data;
  const issueKey =
    data.taskNumber !== null
      ? `#${data.taskNumber}`
      : `${subject.label} update`;
  const taskLabel = `${issueKey} ${data.taskTitle}`;
  const safeTitle = sanitizeDiscordContent(title);
  const safeBody = sanitizeDiscordContent(body);
  const safeTaskLabel = sanitizeDiscordContent(taskLabel);
  const safeProjectName = sanitizeDiscordContent(data.projectName);
  const safeStatus = sanitizeDiscordContent(
    data.columnName ?? toSentenceCase(data.statusSlug),
  );
  const safePriority = sanitizeDiscordContent(toSentenceCase(data.priority));
  const safeActor = data.actorName
    ? sanitizeDiscordContent(data.actorName)
    : null;

  try {
    await postToDiscord(config.webhookUrl, {
      content: `${safeTitle}: ${safeTaskLabel}`,
      embeds: [
        {
          title: safeTitle,
          description: safeBody,
          url: data.taskUrl ?? undefined,
          color: 0x5865f2,
          fields: [
            {
              name: subject.label,
              value: data.taskUrl
                ? `[${safeTaskLabel}](${data.taskUrl})`
                : safeTaskLabel,
              inline: true,
            },
            {
              name: "Project",
              value: safeProjectName,
              inline: true,
            },
            ...(subject.showsWorkflow
              ? [
                  { name: "Status", value: safeStatus, inline: true },
                  { name: "Priority", value: safePriority, inline: true },
                ]
              : []),
          ],
          footer: {
            text: safeActor
              ? `Triggered by ${safeActor}`
              : "Triggered by Kaneo",
          },
        },
      ],
    });
  } catch (error) {
    console.error("sendDiscordMessage postToDiscord failed", {
      error,
      webhookUrl: redactWebhookUrl(config.webhookUrl),
      channelName: config.channelName ?? null,
      taskUrl: data.taskUrl,
    });
  }
}

type DiscordMessageContent = {
  title: string;
  body: string;
};

async function runDiscordHandler(
  context: PluginContext,
  event: {
    taskId: string;
    projectId: string;
    userId: string | null;
  },
  featureKey: DiscordEventKey,
  buildMessage: (data: DiscordEventData) => DiscordMessageContent,
): Promise<void> {
  const config = normalizeDiscordConfig(context.config as DiscordConfig);
  if (!isEnabled(config, featureKey)) return;

  const data = await getDiscordEventData(
    event.taskId,
    event.projectId,
    event.userId,
  );
  if (!data) return;

  const { title, body } = buildMessage(data);
  await sendDiscordMessage(config, title, body, data);
}

export async function handleTaskCreated(
  event: TaskCreatedEvent,
  context: PluginContext,
): Promise<void> {
  await runDiscordHandler(context, event, "taskCreated", ({ subject }) => ({
    title: `New ${subject.noun} created`,
    body: `A new ${subject.noun} was added: **${event.title}**`,
  }));
}

export async function handleTaskStatusChanged(
  event: TaskStatusChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runDiscordHandler(
    context,
    event,
    "taskStatusChanged",
    ({ subject }) => ({
      title: `${subject.label} status changed`,
      body: `**${event.title}** moved from **${toSentenceCase(event.oldStatus)}** to **${toSentenceCase(event.newStatus)}**.`,
    }),
  );
}

export async function handleTaskPriorityChanged(
  event: TaskPriorityChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runDiscordHandler(
    context,
    event,
    "taskPriorityChanged",
    ({ subject }) => ({
      title: `${subject.label} priority changed`,
      body: `**${event.title}** changed from **${toSentenceCase(event.oldPriority)}** to **${toSentenceCase(event.newPriority)}**.`,
    }),
  );
}

export async function handleTaskTitleChanged(
  event: TaskTitleChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runDiscordHandler(
    context,
    event,
    "taskTitleChanged",
    ({ subject }) => ({
      title: `${subject.label} title changed`,
      body: `${subject.label} renamed from **${truncate(event.oldTitle, 120)}** to **${truncate(event.newTitle, 120)}**.`,
    }),
  );
}

export async function handleTaskDescriptionChanged(
  event: TaskDescriptionChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runDiscordHandler(
    context,
    event,
    "taskDescriptionChanged",
    ({ subject }) => ({
      title: `${subject.label} description changed`,
      body: `The ${subject.noun} description was updated${event.newDescription ? `: ${truncate(event.newDescription.replace(/\s+/g, " "), 160)}` : "."}`,
    }),
  );
}

export async function handleTaskCommentCreated(
  event: TaskCommentCreatedEvent,
  context: PluginContext,
): Promise<void> {
  await runDiscordHandler(
    context,
    event,
    "taskCommentCreated",
    ({ subject }) => ({
      title: `New ${subject.noun} comment`,
      body: truncate(event.comment.replace(/\s+/g, " "), 200),
    }),
  );
}
