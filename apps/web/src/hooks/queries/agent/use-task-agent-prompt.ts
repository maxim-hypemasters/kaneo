import { queryOptions, useQuery } from "@tanstack/react-query";
import getTaskAgentPrompt from "@/fetchers/agent/get-task-agent-prompt";
import { agentKeys } from "./agent-keys";

// Always outdated, since the prompt follows the task text, its decisions
// and its comments.
export function taskAgentPromptQuery(taskId: string) {
  return queryOptions({
    queryKey: agentKeys.prompt(taskId),
    queryFn: () => getTaskAgentPrompt(taskId),
    staleTime: 0,
    retry: false,
  });
}

export function useTaskAgentPrompt(
  taskId: string,
  { enabled }: { enabled: boolean },
) {
  return useQuery({ ...taskAgentPromptQuery(taskId), enabled });
}
