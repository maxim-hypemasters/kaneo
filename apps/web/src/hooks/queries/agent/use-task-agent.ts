import { useQuery } from "@tanstack/react-query";
import getTaskAgent from "@/fetchers/agent/get-task-agent";
import { HttpError } from "@/lib/http-error";
import { agentKeys } from "./agent-keys";

// Features (400) and an instance with the agent turned off (404) answer with
// expected errors that retrying cannot fix. Socket messages and mutations
// only mark a closed task's state invalid, so opening a task always fetches.
export function useTaskAgent(
  taskId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: agentKeys.task(taskId ?? ""),
    queryFn: () => getTaskAgent(taskId ?? ""),
    enabled: enabled && Boolean(taskId),
    refetchOnMount: "always",
    retry: (failureCount, error) =>
      !(error instanceof HttpError && error.status < 500) && failureCount < 2,
  });
}
