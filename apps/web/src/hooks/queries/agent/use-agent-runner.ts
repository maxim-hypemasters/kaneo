import { useQuery } from "@tanstack/react-query";
import getAgentRunner from "@/fetchers/agent/get-agent-runner";
import { agentKeys } from "./agent-keys";

// A runner polls about once a minute, so online state is refreshed while the
// page is open.
const RUNNER_REFRESH_MS = 30_000;

// Admins only: the API answers 403 without workspace:manage_settings.
export function useAgentRunner(
  workspaceId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: agentKeys.runner(workspaceId ?? ""),
    queryFn: () => getAgentRunner(workspaceId ?? ""),
    enabled: enabled && Boolean(workspaceId),
    refetchInterval: RUNNER_REFRESH_MS,
  });
}
