import type { RawNotification } from "../api/notifications.js";
import { dayRangeLabel } from "./day-range-label.js";

export type NotificationView = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly message: string | null;
  readonly read: boolean;
  readonly createdAt: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly taskTitle: string | null;
};

type EventData = Readonly<Record<string, unknown>>;

function record(value: unknown): EventData | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EventData)
    : null;
}

function field(data: EventData | null, key: string): string | null {
  const value = data?.[key];
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function statusLabel(slug: string | null): string {
  if (!slug) return "unknown";
  const words = slug.replace(/[-_]+/gu, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function leadTime(data: EventData): string {
  const minutes = Number(data.leadTimeMinutes ?? 1440);
  const plural = (count: number, unit: string) =>
    `${count} ${unit}${count === 1 ? "" : "s"}`;
  if (minutes % 1440 === 0) return plural(minutes / 1440, "day");
  if (minutes % 60 === 0) return plural(minutes / 60, "hour");
  return plural(minutes, "minute");
}

function timeOffRange(data: EventData): string {
  return (
    dayRangeLabel(field(data, "startDate"), field(data, "endDate")) ??
    "Dates unavailable"
  );
}

function describe(
  raw: RawNotification,
  data: EventData,
): { readonly title: string; readonly message: string | null } | null {
  const task = field(data, "taskTitle");
  const named = task ?? "a task";
  switch (raw.type) {
    case "task_created":
      return { title: "New task created", message: named };
    case "workspace_created":
      return {
        title: "Workspace created",
        message: `Your workspace "${field(data, "workspaceName") ?? ""}" has been created`,
      };
    case "task_status_changed":
      return {
        title: "Task status changed",
        message: `"${named}" moved from ${statusLabel(field(data, "oldStatus"))} to ${statusLabel(field(data, "newStatus"))}`,
      };
    case "task_assignee_changed":
      return { title: "Task assigned to you", message: named };
    case "task_mention": {
      const who = field(data, "mentionerName") ?? "Someone";
      return { title: `${who} mentioned you`, message: named };
    }
    case "test_case_mention": {
      const who = field(data, "mentionerName") ?? "Someone";
      return {
        title: `${who} mentioned you`,
        message: field(data, "testCaseTitle") ?? "a test case",
      };
    }
    case "task_comment": {
      const who = field(data, "commenterName") ?? "Someone";
      const preview = field(data, "commentPreview");
      return {
        title: `${who} commented on your task`,
        message: preview ? `${named}: ${preview}` : named,
      };
    }
    case "task_triage_new": {
      const who = field(data, "reporterName");
      return {
        title: "New work to triage",
        message: who ? `${who} reported "${named}"` : named,
      };
    }
    case "task_triage_accepted": {
      const who = field(data, "actorName") ?? "Someone";
      return { title: `${who} accepted your report`, message: named };
    }
    case "task_triage_declined": {
      const who = field(data, "actorName") ?? "Someone";
      const reason = field(data, "reason");
      return {
        title: `${who} declined your report`,
        message: reason ? `${named}: ${reason}` : named,
      };
    }
    case "due_date_reminder":
      return {
        title: "Task due soon",
        message: `${named} is due in ${leadTime(data)}`,
      };
    case "task_overdue":
      return {
        title: "Task overdue",
        message: `${named} is past its due date`,
      };
    case "time_entry_created":
      return { title: "Time tracking started", message: named };
    case "time_off_requested": {
      const who = field(data, "requesterName") ?? "Someone";
      const days = field(data, "days");
      const workdays = days === "1" ? "1 working day" : `${days} working days`;
      return {
        title: `${who} requested time off`,
        message: days
          ? `${timeOffRange(data)} (${workdays})`
          : timeOffRange(data),
      };
    }
    case "time_off_approved":
    case "time_off_declined": {
      const decider = field(data, "deciderName");
      const verb = raw.type === "time_off_approved" ? "approved" : "declined";
      return {
        title: `Time off ${verb}`,
        message: decider
          ? `${timeOffRange(data)}, ${verb} by ${decider}`
          : timeOffRange(data),
      };
    }
    case "time_off_member_away":
      return {
        title: `${field(data, "userName") ?? "A teammate"} is away`,
        message: timeOffRange(data),
      };
    // Calendar request notices never carry the country or region.
    case "time_off_holiday_calendar_requested":
      return {
        title: `${field(data, "requesterName") ?? "Someone"} asked to change their public holidays`,
        message: "Waiting for your review",
      };
    case "time_off_holiday_calendar_approved":
    case "time_off_holiday_calendar_declined": {
      const decider = field(data, "deciderName");
      const approved = raw.type === "time_off_holiday_calendar_approved";
      return {
        title: `Public holiday change ${approved ? "approved" : "declined"}`,
        message: decider
          ? `${approved ? "Approved" : "Declined"} by ${decider}`
          : null,
      };
    }
    default:
      return null;
  }
}

function singleLine(value: string | null): string | null {
  if (value === null) return null;
  const line = value.replace(/\s+/gu, " ").trim();
  return line === "" ? null : line;
}

export function normalizeNotification(raw: RawNotification): NotificationView {
  const data = record(raw.eventData);
  const described = data ? describe(raw, data) : null;
  const isTask = raw.resourceType === "task" && raw.resourceId !== null;
  return {
    id: raw.id,
    type: raw.type,
    title: singleLine(described?.title ?? raw.title) ?? statusLabel(raw.type),
    message: singleLine(described?.message ?? raw.content),
    read: raw.isRead === true,
    createdAt: raw.createdAt,
    workspaceId:
      field(data, "workspaceId") ??
      (raw.resourceType === "workspace" ? raw.resourceId : null),
    projectId: field(data, "projectId"),
    taskId: isTask ? raw.resourceId : null,
    taskTitle: isTask ? field(data, "taskTitle") : null,
  };
}
