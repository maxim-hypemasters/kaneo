import { useQuery } from "@tanstack/react-query";
import getAssistantStatus from "@/fetchers/assistant/get-assistant-status";
import { assistantKeys } from "./assistant-keys";

// Whether members can chat, for everyone in the workspace. Never carries the
// key or its hint.
export function useAssistantStatus(
  workspaceId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: assistantKeys.status(workspaceId ?? ""),
    queryFn: () => getAssistantStatus(workspaceId ?? ""),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60_000,
  });
}
