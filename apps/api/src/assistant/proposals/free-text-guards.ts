import type { AssistantProposalPreview } from "../message-types";
import { updateTarget } from "./update-target";

type Json = Record<string, unknown>;

// Updates whose API has no conflict check for these text fields: a write
// would silently replace an edit made since the proposal. A page or
// document rename saves at whatever revision it finds when it runs.
const GUARDED_FIELDS: Record<string, readonly string[]> = {
  update_project_details: ["name", "description"],
  update_milestone: ["title", "description"],
  update_release: ["name", "description"],
  update_task: ["title"],
  update_project_page: ["title"],
  update_feature_document: ["title"],
};

/** What to re-read before running a proposal, and what it must still say. */
export type FreeTextGuard = {
  path: string;
  expected: { key: string; from: string | null }[];
};

/** A text field as the card's `from` shows it; null when empty. */
export function readFreeText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The previewed text fields to compare before an update without a server
 * conflict check runs, or null when nothing needs checking. Each field the
 * card showed with a previous value must still have it.
 */
export function freeTextGuard(
  toolName: string,
  args: Json,
  preview: AssistantProposalPreview | null,
): FreeTextGuard | null {
  const keys = GUARDED_FIELDS[toolName];
  const target = updateTarget(toolName, args);
  if (!keys || !target || !preview) return null;
  const expected = preview.fields.flatMap((field) =>
    keys.includes(field.key) && field.from !== undefined
      ? [{ key: field.key, from: field.from }]
      : [],
  );
  return expected.length === 0 ? null : { path: target.path, expected };
}

/** Whether any guarded field differs from what the card showed. */
export function freeTextChanged(guard: FreeTextGuard, current: Json): boolean {
  return guard.expected.some(
    ({ key, from }) => (readFreeText(current[key]) ?? "") !== (from ?? ""),
  );
}
