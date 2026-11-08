export type ActivitySubject = "task" | "feature";

// Bugs are worded as tasks, as chat messages word them.
export function activitySubjectOf(
  taskType: string | null | undefined,
): ActivitySubject {
  return taskType === "feature" ? "feature" : "task";
}

const CREATED_TYPES = new Set(["create", "created", "task"]);

function toDisplayCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function toSentenceCase(value: string) {
  const words = value.replace(/[-_]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function activityResultTitle(
  type: string,
  itemTitle: string | null,
  subject: ActivitySubject,
) {
  const title = itemTitle || subject;
  if (type === "comment") return `Comment on ${title}`;
  if (type === "feature_update") return `Update on ${title}`;
  if (CREATED_TYPES.has(type)) return `Created ${title}`;
  return `${toSentenceCase(type)} on ${title}`;
}

// A readable summary of an activity, phrased to follow the actor's name.
// Names from a project the viewer can't see arrive redacted to null.
export function activitySearchContent(
  type: string,
  content: string | null,
  eventData: unknown,
  subject: ActivitySubject,
) {
  if (content) return content;
  if (CREATED_TYPES.has(type)) return `created the ${subject}`;
  if (type === "feature_archived") return "archived the feature";
  if (type === "feature_unarchived") return "restored the feature";
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return undefined;
  }

  const data = eventData as Record<string, unknown>;

  switch (type) {
    case "status_changed":
      return `changed status from ${toDisplayCase(String(data.oldStatus ?? ""))} to ${toDisplayCase(String(data.newStatus ?? ""))}`;
    case "priority_changed":
      return `changed priority from ${toDisplayCase(String(data.oldPriority ?? ""))} to ${toDisplayCase(String(data.newPriority ?? ""))}`;
    case "unassigned":
      return `unassigned the ${subject}`;
    case "assignee_changed":
      return data.isSelfAssigned
        ? `assigned the ${subject} to themselves`
        : `assigned the ${subject} to ${String(data.newAssignee ?? "someone")}`;
    case "due_date_changed":
      if (!data.newDueDate) {
        return "cleared the due date";
      }
      if (!data.oldDueDate) {
        return `set due date to ${String(data.newDueDate)}`;
      }
      return `changed due date from ${String(data.oldDueDate)} to ${String(data.newDueDate)}`;
    case "title_changed":
      return `changed title from "${String(data.oldTitle ?? "")}" to "${String(data.newTitle ?? "")}"`;
    case "moved":
      return data.fromProjectName
        ? `moved the ${subject} from "${String(data.fromProjectName)}" to "${String(data.toProjectName ?? "")}"`
        : `moved the ${subject} from another project to "${String(data.toProjectName ?? "")}"`;
    case "feature_changed":
      if (!data.newFeatureId) return "removed the task from its feature";
      return data.newFeatureTitle
        ? `added the task to feature "${String(data.newFeatureTitle)}"`
        : "added the task to a feature";
    case "milestone_changed":
      if (!data.newMilestoneId) return "removed the task from its milestone";
      return data.newMilestoneTitle
        ? `added the task to milestone "${String(data.newMilestoneTitle)}"`
        : "added the task to a milestone";
    case "release_changed":
      if (!data.newReleaseId) return "removed the task from its release";
      return data.newReleaseName
        ? `added the task to release "${String(data.newReleaseName)}"`
        : "added the task to a release";
    case "type_changed":
      return typeof data.newType === "string"
        ? `changed the type to ${data.newType}`
        : undefined;
    default:
      return undefined;
  }
}
