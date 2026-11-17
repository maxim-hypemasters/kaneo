import type { ToolClient } from "@kaneo/mcp/tools";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InternalRequestOutcome } from "../../utils/internal-api-client";
import { TOOL_RESULT_MAX_CHARS } from "../constants";
import type {
  AssistantProposalPreview,
  AssistantResultSummary,
} from "../message-types";
import type { AssistantTools } from "../tools/assistant-tools";
import { compactToolResult } from "../tools/compact-tool-result";
import { ARCHIVED_SINCE, UNARCHIVING } from "./archived-task";
import { freeTextChanged, freeTextGuard } from "./free-text-guards";
import { createIdLabels } from "./id-labels";
import {
  summarizeWriteResult,
  type WrittenTask,
  writtenTaskId,
} from "./summarize-write-result";
import { updateTarget } from "./update-target";

export const CHANGED_SINCE =
  "Changed since you proposed this; nothing was written. Re-read and propose again.";
export const OUTCOME_UNKNOWN = "Outcome unknown; check before retrying.";
// Saved when a row is claimed, so a crash mid-write leaves the truth.
export const APPROVED_OUTCOME_UNKNOWN =
  "Approved; outcome unknown, check before retrying.";
export const NOT_RUNNABLE =
  "This change can no longer run, so nothing was written. Propose it again.";
export const GUARD_UNREADABLE =
  "Couldn't check that nothing changed since the proposal, so nothing was written. Try again later.";

type Json = Record<string, unknown>;

/** A claimed proposal, as stored. */
export type ApprovedRow = {
  toolName: string | null;
  toolArgs: string | null;
  preview: AssistantProposalPreview | null;
};

export type ApprovedOutcome = {
  /** What the model gets back. */
  content: string;
  isError: boolean;
  resultSummary: AssistantResultSummary | null;
};

export type ExecutionDeps = {
  /** Write-mode tools over `writeClient`, acting as the approver. */
  tools: AssistantTools;
  writeClient: { lastOutcome: InternalRequestOutcome | null };
  /** Read-only and separate, so its requests never touch `lastOutcome`. */
  readClient: ToolClient;
  workspace: { id: string; slug: string };
  /** Asked right before the write; false leaves the row unrun. */
  mayWrite?: () => boolean;
};

const failed = (content: string): ApprovedOutcome => ({
  content,
  isError: true,
  resultSummary: null,
});

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseArgs(raw: string | null): Json | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// A gateway error may come after the API received the write.
const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

const isUnknown = (outcome: InternalRequestOutcome | null) =>
  outcome?.kind === "timeout" ||
  outcome?.kind === "network" ||
  (outcome?.kind === "status" && GATEWAY_STATUSES.has(outcome.status));

/**
 * Re-reads what an update changes before it runs, when it needs checking:
 * a task's status, so an archived task stays archived, and the free text the
 * card showed, so an edit made since isn't overwritten. Null when the row
 * may run.
 */
async function checkCurrent(
  toolName: string,
  args: Json,
  row: ApprovedRow,
  deps: ExecutionDeps,
): Promise<ApprovedOutcome | null> {
  const guard = freeTextGuard(toolName, args, row.preview);
  const archivable = UNARCHIVING.has(toolName);
  const path =
    guard?.path ??
    (archivable ? updateTarget(toolName, args)?.path : undefined);
  if (!path) return null;

  let current: unknown;
  try {
    current = await deps.readClient.json(path, { method: "GET" });
  } catch {
    return failed(GUARD_UNREADABLE);
  }
  if (!isRecord(current)) return failed(GUARD_UNREADABLE);
  if (archivable && current.status === "archived")
    return failed(ARCHIVED_SINCE);
  if (guard && freeTextChanged(guard, current)) return failed(CHANGED_SINCE);
  return null;
}

async function summarize(
  toolName: string,
  args: Json,
  parsed: unknown,
  deps: ExecutionDeps,
): Promise<AssistantResultSummary> {
  // A fresh read, so the summary names the task as the write left it.
  const labels = createIdLabels(deps.readClient, deps.workspace.id);
  const taskId = writtenTaskId(toolName, args, parsed);
  const ref = taskId ? await labels.task(taskId).catch(() => null) : null;
  const task: WrittenTask | null = ref
    ? { ticket: ref.ticket, title: ref.title, projectId: ref.projectId }
    : null;
  return summarizeWriteResult(toolName, args, parsed, {
    workspaceId: deps.workspace.id,
    workspaceSlug: deps.workspace.slug,
    task,
  });
}

/**
 * Runs one approved proposal as the approver, with the arguments the card
 * was built from. Task updates first check the task isn't archived, and
 * free-text updates without a server conflict check that what the card
 * showed is unchanged; either writes nothing otherwise. Null when
 * `mayWrite` declines right before the write: nothing ran. A request that
 * timed out, lost its connection or got a gateway error leaves the outcome
 * unknown; only an answer from the API is a definite failure.
 */
export async function executeApproved(
  row: ApprovedRow,
  deps: ExecutionDeps,
): Promise<ApprovedOutcome | null> {
  const args = parseArgs(row.toolArgs);
  const handle = row.toolName ? deps.tools.lookup(row.toolName) : null;
  if (!args || !handle || handle.readOnly) return failed(NOT_RUNNABLE);

  const refused = await checkCurrent(handle.name, args, row, deps);
  if (refused) return refused;
  if (deps.mayWrite && !deps.mayWrite()) return null;

  deps.writeClient.lastOutcome = null;
  let result: CallToolResult;
  try {
    result = await handle.run(args);
  } catch {
    // Registry tools turn errors into results; anything thrown may still
    // have reached the API.
    return deps.writeClient.lastOutcome === null
      ? failed(NOT_RUNNABLE)
      : failed(OUTCOME_UNKNOWN);
  }
  if (isUnknown(deps.writeClient.lastOutcome)) return failed(OUTCOME_UNKNOWN);

  const compact = compactToolResult(result, {
    maxChars: TOOL_RESULT_MAX_CHARS,
  });
  if (compact.isError) return failed(compact.errorText ?? compact.content);
  return {
    content: compact.content,
    isError: false,
    resultSummary: await summarize(
      handle.name,
      args,
      compact.parsed,
      deps,
    ).catch(() => ({ label: "Done", href: null })),
  };
}
