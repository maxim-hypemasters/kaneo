import { useQuery } from "@tanstack/react-query";
import getAssistantSettings from "@/fetchers/assistant/get-assistant-settings";
import { assistantKeys } from "./assistant-keys";

// Admins only: the API answers 403 without workspace:manage_settings.
export function useAssistantSettings(
  workspaceId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: assistantKeys.settings(workspaceId ?? ""),
    queryFn: () => getAssistantSettings(workspaceId ?? ""),
    enabled: enabled && Boolean(workspaceId),
  });
}
