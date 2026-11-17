import { useState } from "react";
import { useDecideAssistantActions } from "@/hooks/mutations/assistant/use-decide-assistant-actions";
import { useDecisionsInFlight } from "@/hooks/mutations/assistant/use-decisions-in-flight";

// Mirrors MAX_DECISIONS in apps/api/src/assistant/constants.ts. A step
// proposes at most as many, so Approve all covers every waiting card.
export const MAX_DECISIONS = 10;

/**
 * Decisions on the open chat's proposed changes: what is on its way, so the
 * cards can show it, and a way to approve or reject some of them.
 */
export function useProposalDecisions(
  workspaceId: string,
  chatId: string | null,
  options: { onResumable?: (chatId: string) => void },
) {
  const mutation = useDecideAssistantActions(workspaceId, options);
  const inFlight = useDecisionsInFlight(workspaceId);
  const [justDecided, setJustDecided] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const variables = inFlight.find((decision) => decision.chatId === chatId);
  const decidingHere = variables !== undefined;
  const onTheirWay = variables?.decisions ?? [];

  return {
    /** A decision is on its way, in this chat or another one. */
    anyDeciding: inFlight.length > 0,
    /** A decision on this chat's changes is on its way. */
    decidingHere,
    /** Decisions on their way, by message id: true approves, false rejects. */
    deciding: new Map(
      onTheirWay.map((decision) => [decision.messageId, decision.approve]),
    ),
    /** A decision on several changes at once that is on its way. */
    batchDecision:
      onTheirWay.length > 1 ? (onTheirWay[0]?.approve ?? null) : null,
    /**
     * Rows decided here since the chat view opened, whose outcome is news to
     * announce; rows loaded from history are not.
     */
    justDecided,
    decide: (approve: boolean, messageIds: readonly string[]) => {
      if (!chatId || messageIds.length === 0) return;
      mutation.mutate(
        {
          chatId,
          decisions: messageIds
            .slice(0, MAX_DECISIONS)
            .map((messageId) => ({ messageId, approve })),
        },
        {
          onSuccess: (result) =>
            setJustDecided(
              (ids) =>
                new Set([...ids, ...result.messages.map((row) => row.id)]),
            ),
        },
      );
    },
  };
}
