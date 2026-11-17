import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";

export type ToolStepStatus = "running" | "done" | "error" | "stopped";

export type ToolStep = {
  /**
   * Unique in the chat and stable while the turn streams: the asking row's
   * id with the call's position, or the tool row's id when its call isn't
   * loaded. Call ids alone can repeat across steps.
   */
  id: string;
  name: string | null;
  status: ToolStepStatus;
  errorText: string | null;
};

export type ConversationItem =
  | { kind: "user"; id: string; message: AssistantMessage }
  | { kind: "answer"; id: string; message: AssistantMessage }
  // Reads in a row, with nothing said in between.
  | { kind: "steps"; id: string; steps: ToolStep[] }
  // A proposed change (a write tool row with an approval state).
  | { kind: "proposal"; id: string; message: AssistantMessage };

function stepFor(
  id: string,
  name: string | null,
  row: AssistantMessage | undefined,
  running: boolean,
): ToolStep {
  if (!row) {
    return {
      id,
      name,
      status: running ? "running" : "stopped",
      errorText: null,
    };
  }
  return {
    id,
    name: name ?? row.toolName,
    status: row.isError ? "error" : "done",
    errorText: row.isError ? row.errorText : null,
  };
}

/**
 * Turns a chat's rows into what the conversation shows: user messages,
 * answers, runs of read steps, and proposed changes.
 *
 * As in the API's replay, a step's tool rows directly follow its assistant
 * row, so each call joins the first unused row among those with its id. A
 * call without its row is still running while a turn streams, and was
 * stopped otherwise. A tool row no call claims (its call is in an older,
 * unloaded part of the chat) still shows, on its own.
 */
export function buildConversationItems(
  messages: readonly AssistantMessage[],
  { running }: { running: boolean },
): ConversationItem[] {
  const items: ConversationItem[] = [];
  const addStep = (step: ToolStep) => {
    const last = items.at(-1);
    if (last?.kind === "steps") last.steps.push(step);
    else items.push({ kind: "steps", id: `steps-${step.id}`, steps: [step] });
  };
  const addToolRow = (
    id: string,
    name: string | null,
    row?: AssistantMessage,
  ) => {
    if (row && row.approval !== null) {
      items.push({ kind: "proposal", id: row.id, message: row });
    } else {
      addStep(stepFor(id, name, row, running));
    }
  };

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index] as AssistantMessage;
    if (message.role === "user") {
      items.push({ kind: "user", id: message.id, message });
      continue;
    }
    if (message.role === "tool") {
      addToolRow(message.id, message.toolName, message);
      continue;
    }

    if (message.content.trim()) {
      items.push({ kind: "answer", id: message.id, message });
    }
    const results: AssistantMessage[] = [];
    while (messages[index + 1]?.role === "tool") {
      index += 1;
      results.push(messages[index] as AssistantMessage);
    }
    const used = new Set<AssistantMessage>();
    (message.toolCalls ?? []).forEach((call, position) => {
      const result = results.find(
        (candidate) => candidate.toolCallId === call.id && !used.has(candidate),
      );
      if (result) used.add(result);
      addToolRow(`${message.id}:${position}`, call.name, result);
    });
    for (const result of results) {
      if (!used.has(result)) addToolRow(result.id, result.toolName, result);
    }
  }
  return items;
}
