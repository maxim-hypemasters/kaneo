import type {
  AssistantProposalField,
  AssistantProposalPreview,
} from "../message-types";
import type { ProposalContext } from "../turn/run-tool-calls";
import { ARCHIVED_TASK, UNARCHIVING } from "./archived-task";
import {
  currentDocumentOf,
  documentBodyKey,
  isDocumentEdit,
  planDocumentEdit,
} from "./document-edit";
import { entityPaths } from "./entity-paths";
import type { IdLabels } from "./id-labels";
import { nestedPreview } from "./nested-preview";
import {
  displayValue,
  HIDDEN_KEYS,
  proposalField,
  REF_KEYS,
} from "./proposal-fields";
import { withTriage } from "./triage-fields";
import { triageRouting } from "./triage-routing";
import { changesTriageStatus, TRIAGE_TASK } from "./triage-task";
import { targetKey, updateTarget } from "./update-target";

type Json = Record<string, unknown>;

export type DescribeProposalInput = {
  toolName: string;
  /** The prepared arguments: validated, with pins and defaults. */
  args: Json;
  /** The arguments the model set itself, in its order. */
  modelKeys: readonly string[];
  /** Arguments the server pins, which a card never lists. */
  pinnedKeys: readonly string[];
  labels: IdLabels;
  proposal: ProposalContext;
  /** Who proposes, and runs the change on approval: triage routes by it. */
  userId: string;
};

export type DescribedProposal =
  | { ok: true; preview: AssistantProposalPreview; args: Json }
  | { ok: false; error: string };

// Tools that clear a field the model leaves out: the card shows it cleared.
const CLEARED_WHEN_OMITTED: Record<string, readonly string[]> = {
  update_task_due_date: ["dueDate"],
};

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unreadable(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `Couldn't read what this change would edit (${detail.slice(0, 300)}), so nothing was proposed. Look it up again and use its exact id.`;
}

/** How a card shows an argument's value: ids by label, lists by line. */
async function shownValue(
  key: string,
  value: unknown,
  args: Json,
  labels: IdLabels,
): Promise<string> {
  if (REF_KEYS.has(key) && typeof value === "string")
    return labels.label(key, value, args);
  if (key === "taskIds" && Array.isArray(value)) {
    const names = await Promise.all(
      value.map((id) =>
        typeof id === "string" ? labels.label("taskId", id, args) : "",
      ),
    );
    return names.join("\n");
  }
  if (key === "customFields" && Array.isArray(value)) {
    const lines = await Promise.all(
      value.filter(isRecord).map(async (item) => {
        const field =
          typeof item.fieldId === "string"
            ? await labels.label("fieldId", item.fieldId, args)
            : "";
        return `${field}: ${displayValue("value", item.value)}`;
      }),
    );
    return lines.join("\n");
  }
  return displayValue(key, value);
}

async function customFieldValue(
  args: Json,
  labels: IdLabels,
): Promise<string | null | undefined> {
  if (typeof args.taskId !== "string") return undefined;
  const values = await labels
    .load(entityPaths.taskCustomFields(args.taskId))
    .catch(() => null);
  if (!Array.isArray(values)) return undefined;
  const match = values.find(
    (item) => isRecord(item) && item.fieldId === args.fieldId,
  );
  return isRecord(match) && typeof match.value === "string"
    ? match.value
    : null;
}

/**
 * What an update replaces, read from the entity before the change: ids by
 * label, null when it was empty, undefined when the entity has no such
 * field. Text is kept exactly, so the free-text guard can compare it later.
 */
async function previousValue(
  toolName: string,
  key: string,
  entity: Json,
  args: Json,
  labels: IdLabels,
): Promise<string | null | undefined> {
  if (toolName === "set_task_custom_field_value" && key === "value")
    return customFieldValue(args, labels);
  if (!Object.hasOwn(entity, key)) return undefined;
  const raw = entity[key];
  if (raw === null || raw === undefined) return null;
  if (REF_KEYS.has(key))
    return typeof raw === "string" ? labels.label(key, raw, args) : null;
  if (typeof raw === "string") return raw;
  return displayValue(key, raw);
}

/** The card's target by name, and the argument it shows. */
async function targetOf(
  toolName: string,
  args: Json,
  labels: IdLabels,
): Promise<Pick<AssistantProposalPreview, "target" | "targetKey">> {
  const key = targetKey(toolName);
  const value = args[key];
  if (typeof value !== "string") return { target: null, targetKey: null };
  return {
    target: key === "name" ? value : await labels.label(key, value, args),
    targetKey: key,
  };
}

/**
 * Builds the card for a write the model proposed, from what the user can
 * read now: the target's name, each argument the model set with ids shown
 * by name and, on updates, the value it replaces; a diff for page, document
 * and description edits; and the nested work a new Feature or milestone
 * brings. New Tasks and Bugs that will wait in Triage show the triage
 * status and a note. Refuses rewrites the model hasn't read in full,
 * changes to archived tasks and status changes to tasks waiting in Triage.
 * The returned args are the ones to execute on approval.
 */
export async function describeProposal(
  input: DescribeProposalInput,
): Promise<DescribedProposal> {
  const { toolName, labels } = input;
  let { args } = input;

  const target = updateTarget(toolName, args);
  let entity: Json | null = null;
  if (target) {
    try {
      const loaded = await labels.load(target.path, { fresh: true });
      if (!isRecord(loaded)) return { ok: false, error: unreadable("empty") };
      entity = loaded;
    } catch (error) {
      return { ok: false, error: unreadable(error) };
    }
  }
  if (UNARCHIVING.has(toolName) && entity?.status === "archived")
    return { ok: false, error: ARCHIVED_TASK };
  if (changesTriageStatus(toolName, entity, args))
    return { ok: false, error: TRIAGE_TASK };
  const triage = await triageRouting({
    toolName,
    args,
    labels,
    userId: input.userId,
  });
  if (!triage.ok) return triage;

  let diff: AssistantProposalPreview["diff"] = null;
  if (isDocumentEdit(toolName)) {
    const current = entity ? currentDocumentOf(toolName, entity) : null;
    if (!current) return { ok: false, error: unreadable("no current text") };
    const plan = planDocumentEdit({
      toolName,
      args,
      current,
      proposal: input.proposal,
    });
    if (!plan.ok) return plan;
    args = plan.args;
    diff = plan.diff;
  }

  // A diff already shows the new body, so it isn't listed again.
  const hidden = new Set<string>([
    ...HIDDEN_KEYS,
    ...input.pinnedKeys,
    ...(diff ? [documentBodyKey(toolName) ?? "body", "appendMarkdown"] : []),
  ]);
  const identity = new Set(target?.identityKeys ?? []);
  const keys = [...input.modelKeys, ...(CLEARED_WHEN_OMITTED[toolName] ?? [])]
    .filter((key, index, all) => all.indexOf(key) === index)
    .filter(
      (key) =>
        !hidden.has(key) &&
        (Object.hasOwn(args, key) ||
          CLEARED_WHEN_OMITTED[toolName]?.includes(key)),
    );
  const fields: AssistantProposalField[] = await Promise.all(
    keys.map(async (key) => {
      const value = args[key] ?? null;
      const shown = await shownValue(key, value, args, labels);
      const from =
        entity && !identity.has(key)
          ? await previousValue(toolName, key, entity, args, labels)
          : undefined;
      return proposalField(key, value, shown, from);
    }),
  );

  return {
    ok: true,
    preview: {
      ...(await targetOf(toolName, args, labels)),
      fields: withTriage(fields, triage.routing, args.status),
      diff,
      nested: await nestedPreview(toolName, args, (key, id) =>
        labels.label(key, id, args),
      ),
    },
    args,
  };
}
