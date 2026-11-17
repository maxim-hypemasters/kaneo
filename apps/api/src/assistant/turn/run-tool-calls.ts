import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toAssistantMessageDto } from "../chats/message-response";
import { PARALLEL_READS } from "../constants";
import type {
  AssistantApproval,
  AssistantProposalPreview,
  AssistantToolCall,
  ReadReceipt,
} from "../message-types";
import type {
  AssistantToolHandle,
  AssistantTools,
} from "../tools/assistant-tools";
import { compactToolResult } from "../tools/compact-tool-result";
import { createLimiter } from "../tools/loopback-limiter";
import { extractReadReceipt } from "../tools/read-receipt";
import type { EmitEvent } from "./stream-turn";
import { limitToolCalls } from "./tool-call-limits";
import { insertMessage, type TurnTranscriptRow } from "./turn-messages";

/** What a tool row records for one call. */
export type ToolRowDraft = {
  /** What the model gets back: the compacted result or an error to act on. */
  content: string;
  isError: boolean;
  /** The JSON object string actually executed or proposed, if any. */
  toolArgs: string | null;
  /** null for reads; 'pending' for a proposal awaiting approval. */
  approval: AssistantApproval | null;
  preview?: AssistantProposalPreview | null;
  readReceipts?: ReadReceipt[] | null;
};

/** What a write proposal may check: the history the model saw this step. */
export type ProposalContext = {
  transcript: readonly TurnTranscriptRow[];
  replayedToolRowIds: ReadonlySet<string>;
};

/** Turns a write call into a pending proposal, or an error for the model. */
export type ProposeWrite = (
  call: AssistantToolCall,
  context: ProposalContext,
) => Promise<ToolRowDraft>;

export const INVALID_ARGUMENTS =
  "The arguments were not valid JSON or were cut off, so nothing ran. Call the tool again with one complete, shorter JSON object.";
export const WRITE_NOT_PERMITTED =
  "This user doesn't have permission for this change, so nothing ran.";
export const TOOL_FAILED =
  "The tool failed unexpectedly, so nothing ran. Try again later or answer without it.";

export const errorDraft = (content: string): ToolRowDraft => ({
  content,
  isError: true,
  toolArgs: null,
  approval: null,
});

const unknownTool = (name: string) =>
  errorDraft(
    `There is no tool named "${name.slice(0, 100)}", so nothing ran. Use only the tools you were given.`,
  );

async function runRead(
  handle: AssistantToolHandle,
  args: Record<string, unknown>,
  argsJson: string,
): Promise<ToolRowDraft> {
  let result: CallToolResult;
  try {
    result = await handle.run(args);
  } catch {
    return { ...errorDraft(TOOL_FAILED), toolArgs: argsJson };
  }
  const compact = compactToolResult(result, {
    maxChars: handle.maxResultChars,
    documentField: handle.documentField,
  });
  const receipt = compact.isError
    ? null
    : extractReadReceipt(
        handle.name,
        args,
        compact.parsed,
        compact.bodyComplete,
      );
  return {
    content: compact.content,
    isError: compact.isError,
    toolArgs: argsJson,
    approval: null,
    readReceipts: receipt ? [receipt] : null,
  };
}

export type RunToolCallsInput = {
  chatId: string;
  calls: readonly AssistantToolCall[];
  tools: AssistantTools;
  emit: EmitEvent;
  signal: AbortSignal;
  /** Tool calls the turn may still run. */
  budget: number;
  proposeWrite: ProposeWrite;
  proposal: ProposalContext;
};

/**
 * Answers every call of one step with a tool row, in tool_calls order:
 * reads run (a few at a time) as the user, writes become proposals, and
 * anything else gets an error the model can correct. Calls not started
 * before the turn stops get no row; replay marks them not run.
 */
export async function runToolCalls(
  input: RunToolCallsInput,
): Promise<{ used: number; pendingCount: number }> {
  const { tools, signal } = input;
  const reads = createLimiter(PARALLEL_READS);

  const draft = async (
    call: AssistantToolCall,
  ): Promise<ToolRowDraft | null> => {
    if (call.invalid) return errorDraft(INVALID_ARGUMENTS);
    const handle = tools.lookup(call.name);
    if (!handle) return unknownTool(call.name);
    if (!handle.readOnly) {
      if (!handle.permitted) return errorDraft(WRITE_NOT_PERMITTED);
      return input.proposeWrite(call, input.proposal);
    }
    const prepared = tools.prepareArgs(call.name, call.arguments);
    if (!prepared.ok) return errorDraft(prepared.error);
    return reads.run(async () =>
      signal.aborted ? null : runRead(handle, prepared.args, prepared.argsJson),
    );
  };

  const planned = limitToolCalls(input.calls, input.budget);
  // Started together, so reads overlap; saved in order below.
  const drafts = planned.map(({ call, refusal }) =>
    refusal !== null
      ? Promise.resolve(errorDraft(refusal))
      : draft(call).catch(() => errorDraft(TOOL_FAILED)),
  );

  let pendingCount = 0;
  for (const [index, { call }] of planned.entries()) {
    const result = await drafts[index];
    if (!result) continue;
    const row = await insertMessage({
      chatId: input.chatId,
      role: "tool",
      toolCallId: call.id,
      toolName: call.name,
      content: result.content,
      isError: result.isError,
      toolArgs: result.toolArgs,
      approval: result.approval,
      preview: result.preview ?? null,
      readReceipts: result.readReceipts ?? null,
    });
    if (row.approval === "pending") pendingCount += 1;
    await input.emit({ type: "message", message: toAssistantMessageDto(row) });
  }

  return {
    used: planned.filter((item) => item.refusal === null).length,
    pendingCount,
  };
}
