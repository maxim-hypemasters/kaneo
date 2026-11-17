import type { AssistantResultSummary } from "../message-types";

type Json = Record<string, unknown>;

/** The task a write was on, or created, as it is after the write. */
export type WrittenTask = {
  /** KAN-42, or null when the project's key couldn't be read. */
  ticket: string | null;
  title: string;
  projectId: string;
};

export type WriteSummaryContext = {
  workspaceId: string;
  workspaceSlug: string;
  task: WrittenTask | null;
};

const DONE: AssistantResultSummary = { label: "Done", href: null };
const MAX_LABEL_CHARS = 200;

// Writes on one task, and how their summary starts.
const TASK_VERBS: Record<string, string> = {
  create_task: "Created",
  update_task: "Updated",
  update_task_status: "Updated",
  update_task_assignee: "Updated",
  update_task_estimate: "Updated",
  update_task_due_date: "Updated",
  update_task_description: "Updated",
  set_task_type: "Updated",
  set_task_feature: "Updated",
  set_task_milestone: "Updated",
  set_task_release: "Updated",
  set_task_custom_field_value: "Updated",
  create_task_comment: "Commented on",
  create_task_external_link: "Added a link to",
  create_time_entry: "Logged time on",
  attach_label_to_task: "Added a label to",
  create_task_relation: "Linked",
  post_feature_update: "Posted an update on",
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summary(label: string, href: string | null): AssistantResultSummary {
  const cut =
    label.length > MAX_LABEL_CHARS
      ? `${label.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…`
      : label;
  return { label: cut, href };
}

// The link templates of the system prompt.
const links = (ctx: WriteSummaryContext) => {
  const ws = encodeURIComponent(ctx.workspaceId);
  const project = (projectId: string) =>
    `/dashboard/workspace/${ws}/project/${encodeURIComponent(projectId)}`;
  return {
    task: (ticket: string) =>
      `/${encodeURIComponent(ctx.workspaceSlug)}/task/${encodeURIComponent(ticket)}`,
    project,
    release: (projectId: string, releaseId: string) =>
      `${project(projectId)}/releases/${encodeURIComponent(releaseId)}`,
    document: (projectId: string, documentId: string, featureId?: string) =>
      `${project(projectId)}?tab=documents&documentId=${encodeURIComponent(documentId)}${
        featureId ? `&documentFeatureId=${encodeURIComponent(featureId)}` : ""
      }`,
  };
};

function verbed(verb: string, toolName: string) {
  return toolName.startsWith("create_") ? `Created ${verb}` : `Updated ${verb}`;
}

/**
 * The line an approved card shows once its write succeeded, with a link to
 * what changed when there is one. `parsed` is the tool's JSON result. Falls
 * back to "Done" without a link.
 */
export function summarizeWriteResult(
  toolName: string,
  args: Json,
  parsed: unknown,
  ctx: WriteSummaryContext,
): AssistantResultSummary {
  const result = isRecord(parsed) ? parsed : {};
  const link = links(ctx);

  const verb = TASK_VERBS[toolName];
  if (verb) {
    const { task } = ctx;
    if (!task) return DONE;
    const label = task.ticket ? `${task.ticket} ${task.title}` : task.title;
    return summary(
      `${verb} ${label}`,
      task.ticket ? link.task(task.ticket) : null,
    );
  }

  const name = text(result.name) ?? text(args.name);
  const title = text(result.title) ?? text(args.title);
  const id = text(result.id);
  const projectId = text(result.projectId) ?? text(args.projectId);

  switch (toolName) {
    case "create_project":
    case "update_project_details": {
      const target = id ?? projectId;
      return name
        ? summary(
            `${verbed("project", toolName)} ${name}`,
            target ? link.project(target) : null,
          )
        : DONE;
    }
    case "create_label":
      return name ? summary(`Created label ${name}`, null) : DONE;
    case "create_milestone":
    case "update_milestone":
      return title
        ? summary(
            `${verbed("milestone", toolName)} ${title}`,
            ctx.task?.ticket ? link.task(ctx.task.ticket) : null,
          )
        : DONE;
    case "create_release":
    case "update_release":
      return name
        ? summary(
            `${verbed("release", toolName)} ${name}`,
            id && projectId ? link.release(projectId, id) : null,
          )
        : DONE;
    case "create_project_page":
    case "update_project_page":
      return title
        ? summary(
            `${verbed("page", toolName)} ${title}`,
            id && projectId ? link.document(projectId, id) : null,
          )
        : DONE;
    case "create_feature_document":
    case "update_feature_document": {
      const featureId = text(result.featureId) ?? text(args.featureId);
      const documentProject = ctx.task?.projectId ?? null;
      return title
        ? summary(
            `${verbed("document", toolName)} ${title}`,
            id && featureId && documentProject
              ? link.document(documentProject, id, featureId)
              : null,
          )
        : DONE;
    }
    default:
      return DONE;
  }
}

/** The task a write's summary names: the one it changed or created. */
export function writtenTaskId(
  toolName: string,
  args: Json,
  parsed: unknown,
): string | null {
  const result = isRecord(parsed) ? parsed : {};
  if (toolName === "create_task") return text(result.id);
  return (
    text(args.taskId) ??
    text(args.sourceTaskId) ??
    text(args.featureId) ??
    text(result.featureId)
  );
}
