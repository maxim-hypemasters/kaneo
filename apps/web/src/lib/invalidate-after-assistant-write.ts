import type { QueryClient } from "@tanstack/react-query";

/**
 * After an approved assistant change ran. It can touch any part of the
 * workspace (a task, a Feature with its milestones, a page, a release), and
 * live updates only reach what is on screen, so every cached query outside
 * the assistant's own is refreshed, inactive ones too: a board or document
 * tree cached in the background would otherwise open stale.
 */
export function invalidateAfterAssistantWrite(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] !== "assistant",
    refetchType: "all",
  });
}
