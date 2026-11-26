import { useQuery } from "@tanstack/react-query";
import getProjectAgentSettings from "@/fetchers/agent/get-project-agent-settings";
import { agentKeys } from "./agent-keys";

// Admins only: the API answers 403 without workspace:manage_settings.
// Creating or revoking the runner token invalidates these while the page is
// closed, so they refetch when it opens again.
export function useProjectAgentSettings(
  projectId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: agentKeys.projectSettings(projectId ?? ""),
    queryFn: () => getProjectAgentSettings(projectId ?? ""),
    enabled: enabled && Boolean(projectId),
    refetchOnMount: true,
  });
}
