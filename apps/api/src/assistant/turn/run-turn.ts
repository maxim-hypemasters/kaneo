import { toAssistantMessageDto } from "../chats/message-response";
import {
  MAX_MODEL_CALLS_PER_TURN,
  MAX_TOOL_CALLS_PER_TURN,
} from "../constants";
import { resolveMaxOutputTokens } from "../openrouter/resolve-max-output-tokens";
import { streamChatCompletion } from "../openrouter/stream-chat-completion";
import type {
  ChatMessage,
  CompletionResult,
  ToolDefinition,
} from "../openrouter/types";
import {
  clearProviderError,
  recordProviderError,
} from "../settings/record-provider-error";
import type { ReadyAssistantConfig } from "../settings/load-assistant-config";
import type { AssistantTools } from "../tools/assistant-tools";
import { buildMessages } from "./build-messages";
import { completionOutcome, partialAnswer } from "./completion-outcome";
import { type ProposeWrite, runToolCalls } from "./run-tool-calls";
import { providerErrorToRecord, providerFailure } from "./stream-error";
import type { EmitEvent } from "./stream-turn";
import { buildSystemPrompt } from "./system-prompt";
import { insertMessage, loadTranscript } from "./turn-messages";
import { recordUsage, reserveModelCall } from "./usage";

export type RunTurnInput = {
  chatId: string;
  workspace: { id: string; name: string; slug: string };
  user: { id: string; name: string };
  config: ReadyAssistantConfig;
  tools: AssistantTools;
  emit: EmitEvent;
  /** Aborts on Stop, disconnect, a lost lease or the wall clock. */
  signal: AbortSignal;
  timeZone: string | undefined;
  /** Turns permitted writes into proposals that wait for approval. */
  proposeWrite: ProposeWrite;
};

async function saveInterrupted(input: RunTurnInput, text: string) {
  const content = partialAnswer(text);
  if (content === null) return;
  const row = await insertMessage({
    chatId: input.chatId,
    role: "assistant",
    content,
    status: "interrupted",
    model: input.config.model,
  });
  await input.emit({ type: "message", message: toAssistantMessageDto(row) });
}

/**
 * One model call, streaming its text as `delta` events. Returns null when
 * the turn must end: stopped (partial text saved as interrupted, no event)
 * or failed at OpenRouter (an `error` event, and a rejected key or empty
 * credits recorded on the settings). Other errors are thrown.
 */
async function callModel(
  input: RunTurnInput,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<CompletionResult | null> {
  const { config, emit, signal } = input;
  let streamed = "";
  try {
    return await streamChatCompletion({
      apiKey: config.apiKey,
      model: config.model,
      messages,
      tools,
      allowDataCollection: config.allowDataCollection,
      maxTokens: await resolveMaxOutputTokens(config.model, messages, tools),
      signal,
      onDelta: (text) => {
        streamed += text;
        void emit({ type: "delta", text });
      },
    });
  } catch (error) {
    await saveInterrupted(input, streamed);
    if (signal.aborted) return null;
    const failure = providerFailure(error);
    if (!failure) throw error;
    const recorded = providerErrorToRecord(failure.code);
    if (recorded) {
      await recordProviderError(
        input.workspace.id,
        recorded,
        config.keyCiphertext,
      );
    }
    await emit({ type: "error", ...failure });
    return null;
  }
}

/**
 * The tool-calling loop of one turn: call the model on the transcript, save
 * its reply, run the reads it asked for, and repeat until it answers in
 * text, a write waits for approval, or a limit ends the turn. Every model
 * call is counted against the user's daily cap before it is made.
 */
export async function runTurn(input: RunTurnInput): Promise<void> {
  const { chatId, workspace, user, config, tools, emit, signal } = input;
  const offered = tools.offered();
  // A caller without any write permission is offered no write tools.
  const canWrite = offered.some(
    (tool) => tools.lookup(tool.function.name)?.readOnly === false,
  );
  const systemPrompt = buildSystemPrompt({
    workspace,
    user,
    now: new Date(),
    timeZone: input.timeZone,
    canWrite,
  });
  let toolCallsLeft = MAX_TOOL_CALLS_PER_TURN;
  let providerErrorCleared = config.lastErrorCode === null;

  for (let modelCalls = 0; !signal.aborted; modelCalls++) {
    if (modelCalls >= MAX_MODEL_CALLS_PER_TURN) {
      // The transcript ends in tool results, so Continue can resume.
      await emit({
        type: "error",
        code: "ASSISTANT_STEP_LIMIT",
        retryable: true,
      });
      return;
    }
    if (!(await reserveModelCall(workspace.id, user.id))) {
      await emit({
        type: "error",
        code: "ASSISTANT_DAILY_LIMIT",
        retryable: false,
      });
      return;
    }

    const transcript = await loadTranscript(chatId);
    const { messages, replayedToolRowIds } = buildMessages(transcript, {
      model: config.model,
      systemPrompt,
    });
    const result = await callModel(input, messages, offered);
    if (!result) return;

    const outcome = completionOutcome(result);
    const row = await insertMessage({
      chatId,
      role: "assistant",
      content: outcome.content,
      status: outcome.status,
      model: config.model,
      toolCalls: outcome.toolCalls.length > 0 ? outcome.toolCalls : null,
      reasoningDetails: result.reasoningDetails,
      usage: result.usage,
    });
    if (result.usage) await recordUsage(workspace.id, user.id, result.usage);
    if (!providerErrorCleared) {
      await clearProviderError(workspace.id, config.keyCiphertext);
      providerErrorCleared = true;
    }
    await emit({ type: "message", message: toAssistantMessageDto(row) });

    if (outcome.end?.type === "error") {
      await emit({
        type: "error",
        code: outcome.end.code,
        retryable: outcome.end.retryable,
      });
      return;
    }
    if (outcome.end?.type === "done") {
      await emit({
        type: "done",
        pendingCount: 0,
        ...(outcome.end.truncated ? { truncated: true } : {}),
      });
      return;
    }

    const step = await runToolCalls({
      chatId,
      calls: outcome.toolCalls,
      tools,
      emit,
      signal,
      budget: toolCallsLeft,
      proposeWrite: input.proposeWrite,
      proposal: { transcript, replayedToolRowIds },
    });
    toolCallsLeft -= step.used;
    if (step.pendingCount > 0) {
      await emit({ type: "done", pendingCount: step.pendingCount });
      return;
    }
  }
}
