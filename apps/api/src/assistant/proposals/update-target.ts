import { entityPaths } from "./entity-paths";

type Args = Record<string, unknown>;

const TASK_UPDATES = new Set([
  "update_task",
  "update_task_status",
  "update_task_assignee",
  "update_task_estimate",
  "update_task_due_date",
  "update_task_description",
  "set_task_type",
  "set_task_feature",
  "set_task_milestone",
  "set_task_release",
  "set_task_custom_field_value",
]);

const id = (args: Args, key: string) =>
  typeof args[key] === "string" ? (args[key] as string) : null;

/**
 * The entity an update changes, read before the proposal to show its
 * current values: its GET path and the arguments that locate it, which the
 * card shows without a previous value. Null for creates.
 */
export function updateTarget(
  toolName: string,
  args: Args,
): { path: string; identityKeys: string[] } | null {
  const located = (path: string | null, identityKeys: string[]) =>
    path === null ? null : { path, identityKeys };
  const of = (key: string, path: (value: string) => string) => {
    const value = id(args, key);
    return located(value === null ? null : path(value), [key]);
  };

  if (TASK_UPDATES.has(toolName)) return of("taskId", entityPaths.task);
  switch (toolName) {
    case "update_project_details":
      return of("projectId", entityPaths.project);
    case "update_milestone":
      return of("milestoneId", entityPaths.milestone);
    case "update_release":
      return of("releaseId", entityPaths.release);
    case "update_project_page":
      return of("pageId", entityPaths.page);
    case "update_feature_document": {
      const featureId = id(args, "featureId");
      const documentId = id(args, "documentId");
      return located(
        featureId && documentId
          ? entityPaths.featureDocument(featureId, documentId)
          : null,
        ["featureId", "documentId"],
      );
    }
    default:
      return null;
  }
}

// The argument naming what a card is about, when it isn't the task.
const TARGET_KEYS: Record<string, string> = {
  create_project: "name",
  create_label: "name",
  update_project_details: "projectId",
  create_task: "projectId",
  create_release: "projectId",
  create_project_page: "projectId",
  create_milestone: "featureId",
  post_feature_update: "featureId",
  create_feature_document: "featureId",
  update_milestone: "milestoneId",
  update_release: "releaseId",
  update_project_page: "pageId",
  update_feature_document: "documentId",
  create_task_relation: "sourceTaskId",
};

/**
 * The argument whose label is a card's target: a project, task, Feature,
 * milestone, release, page or document id, or `name` for a new project or
 * label, whose target is the name itself.
 */
export function targetKey(toolName: string): string {
  return TARGET_KEYS[toolName] ?? "taskId";
}
