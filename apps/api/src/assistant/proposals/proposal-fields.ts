import type { AssistantProposalField } from "../message-types";

type Kind = AssistantProposalField["kind"];

/** Ids a card shows by their label. */
export const REF_KEYS: ReadonlySet<string> = new Set([
  "projectId",
  "taskId",
  "sourceTaskId",
  "targetTaskId",
  "featureId",
  "milestoneId",
  "releaseId",
  "userId",
  "leadId",
  "labelId",
  "parentId",
  "pageId",
  "documentId",
  "fieldId",
]);

const MARKDOWN_KEYS: ReadonlySet<string> = new Set([
  "description",
  "body",
  "appendMarkdown",
  "note",
  "content",
]);

const DATE_KEYS: ReadonlySet<string> = new Set([
  "dueDate",
  "startDate",
  "codeFreezeDate",
  "submissionDate",
  "startTime",
  "endTime",
]);

/**
 * Arguments a card never lists: expectations the server injects, the time
 * zone dates are computed in, and creation drafts, which `nested` shows.
 */
export const HIDDEN_KEYS: ReadonlySet<string> = new Set([
  "expectedRevision",
  "expectedDescription",
  "timeZone",
  "featureComposition",
  "newTasks",
]);

/** The note on new work that will wait in Triage. */
export const TRIAGE_FIELD_KEY = "triage";

/** Fields a card can list that aren't arguments, which the server adds. */
export const SERVER_FIELD_KEYS: readonly string[] = [TRIAGE_FIELD_KEY];

export function fieldKind(key: string, value: unknown): Kind {
  if (Array.isArray(value)) return "list";
  if (REF_KEYS.has(key)) return "ref";
  if (MARKDOWN_KEYS.has(key)) return "markdown";
  if (DATE_KEYS.has(key)) return "date";
  return "text";
}

/** Whole minutes and hours, as estimates are entered: "1h 30m". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (isRecord(item) && typeof item.title === "string") return item.title;
  return JSON.stringify(item) ?? "";
}

/**
 * How a card shows a value that isn't an id: text as is, an estimate as a
 * duration, a list one item per line, and nothing for null.
 */
export function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number")
    return key === "estimateSeconds" ? formatDuration(value) : String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(listItem).join("\n");
  return JSON.stringify(value) ?? "";
}

/**
 * One card field. `value` is what the change sets, "" when it clears;
 * `from`, on updates, is what it replaces, null when that was empty.
 */
export function proposalField(
  key: string,
  rawValue: unknown,
  value: string,
  from?: string | null,
): AssistantProposalField {
  return {
    key,
    kind: fieldKind(key, rawValue),
    value,
    ...(from === undefined ? {} : { from }),
  };
}
