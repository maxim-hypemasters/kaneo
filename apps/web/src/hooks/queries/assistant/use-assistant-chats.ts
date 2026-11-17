import { useInfiniteQuery } from "@tanstack/react-query";
import getAssistantChats from "@/fetchers/assistant/get-assistant-chats";
import { assistantKeys } from "./assistant-keys";

// The caller's own chats, latest activity first, a page at a time. Turns
// invalidate the list when they end, so it stays fresh without polling.
export function useAssistantChats(
  workspaceId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: assistantKeys.chats(workspaceId ?? ""),
    queryFn: ({ pageParam }) => getAssistantChats(workspaceId ?? "", pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && Boolean(workspaceId),
    staleTime: 30_000,
  });
}
