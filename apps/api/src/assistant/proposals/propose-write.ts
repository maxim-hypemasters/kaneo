import type { ToolClient } from "@kaneo/mcp/tools";
import { MAX_PROPOSALS_PER_STEP } from "../constants";
import type { AssistantTools } from "../tools/assistant-tools";
import {
  errorDraft,
  type ProposalContext,
  type ProposeWrite,
  WRITE_NOT_PERMITTED,
} from "../turn/run-tool-calls";
import { describeProposal } from "./describe-proposal";
import { withExpectationPlaceholder } from "./document-edit";
import { createIdLabels } from "./id-labels";

export const TOO_MANY_PROPOSALS = `At most ${MAX_PROPOSALS_PER_STEP} changes can wait for approval at once, so this one wasn't proposed. Propose it again after the user decides on the others.`;

function modelKeys(rawArgs: string): string[] {
  try {
    const parsed: unknown = JSON.parse(rawArgs);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? Object.keys(parsed)
      : [];
  } catch {
    return [];
  }
}

/**
 * Turns the write calls of one turn into pending proposals with a card the
 * server built, or into errors the model can act on. `readClient` is the
 * turn's read-only loopback client: everything a card shows, the user can
 * read. Nothing is written until the user approves.
 */
export function createProposeWrite(input: {
  tools: AssistantTools;
  readClient: ToolClient;
  workspaceId: string;
}): ProposeWrite {
  const { tools } = input;
  // One per turn, so a step's lookups are shared and never outlive it.
  const labels = createIdLabels(input.readClient, input.workspaceId);
  // Each step gets its own context object.
  const proposedInStep = new WeakMap<ProposalContext, number>();

  return async (call, context) => {
    const handle = tools.lookup(call.name);
    if (!handle || handle.readOnly || !handle.permitted)
      return errorDraft(WRITE_NOT_PERMITTED);

    // Counted before any await, so the calls keep their order.
    const count = (proposedInStep.get(context) ?? 0) + 1;
    proposedInStep.set(context, count);
    if (count > MAX_PROPOSALS_PER_STEP) return errorDraft(TOO_MANY_PROPOSALS);

    const prepared = tools.prepareArgs(call.name, call.arguments, (args) =>
      withExpectationPlaceholder(call.name, args),
    );
    if (!prepared.ok) return errorDraft(prepared.error);

    const described = await describeProposal({
      toolName: call.name,
      args: prepared.args,
      modelKeys: modelKeys(call.arguments),
      pinnedKeys: handle.entry.pin ?? [],
      labels,
      proposal: context,
    });
    if (!described.ok)
      return { ...errorDraft(described.error), toolArgs: prepared.argsJson };
    return {
      content: "",
      isError: false,
      toolArgs: JSON.stringify(described.args),
      approval: "pending",
      preview: described.preview,
    };
  };
}
