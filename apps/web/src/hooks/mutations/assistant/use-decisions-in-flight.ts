import { useMutationState } from "@tanstack/react-query";
import { assistantKeys } from "@/hooks/queries/assistant/assistant-keys";
import type { DecideVariables } from "./use-decide-assistant-actions";

/**
 * Decisions on proposed changes on their way in this workspace, from any
 * view of its chats. A chat opened while one is on its way (Home's chat
 * minimized and opened again) sees it, unlike the mutation's own state.
 */
export function useDecisionsInFlight(workspaceId: string): DecideVariables[] {
  return useMutationState({
    filters: {
      mutationKey: assistantKeys.decide(workspaceId),
      status: "pending",
    },
    select: (mutation) => mutation.state.variables as DecideVariables,
  });
}
