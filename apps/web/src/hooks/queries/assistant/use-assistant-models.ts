import { useQuery } from "@tanstack/react-query";
import getAssistantModels from "@/fetchers/assistant/get-assistant-models";
import { assistantKeys } from "./assistant-keys";

// OpenRouter's tool-capable models; the API caches the list for an hour.
export function useAssistantModels(
  workspaceId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: assistantKeys.models(workspaceId ?? ""),
    queryFn: () => getAssistantModels(workspaceId ?? ""),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}
