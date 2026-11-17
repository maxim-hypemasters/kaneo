import { useQuery } from "@tanstack/react-query";
import getAssistantChat from "@/fetchers/assistant/get-assistant-chat";
import { HttpError } from "@/lib/http-error";
import { assistantKeys } from "./assistant-keys";

// One chat with its latest messages. While a turn streams into the chat its
// events keep the cache current, so `paused` stops refetches from replacing
// rows the stream has just added; the turn invalidates the chat when it ends.
export function useAssistantChat(
  workspaceId: string | undefined,
  chatId: string | null,
  { paused = false }: { paused?: boolean } = {},
) {
  return useQuery({
    queryKey: assistantKeys.chat(workspaceId ?? "", chatId ?? ""),
    queryFn: () => getAssistantChat(workspaceId ?? "", chatId ?? ""),
    enabled: Boolean(workspaceId && chatId) && !paused,
    staleTime: 30_000,
    // A deleted or someone else's chat answers 404; asking again won't help.
    retry: (failureCount, error) =>
      failureCount < 2 && !(error instanceof HttpError && error.status === 404),
  });
}
