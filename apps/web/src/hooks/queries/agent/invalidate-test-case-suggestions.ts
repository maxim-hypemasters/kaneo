import type { Query, QueryClient } from "@tanstack/react-query";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { agentKeys } from "./agent-keys";

function showsTestCasesSuggestion(query: Query) {
  const agent = query.state.data as Partial<TaskAgent> | undefined;
  return (
    agent?.assessment?.suggestions?.some(
      (suggestion) => suggestion.kind === "test_cases",
    ) ?? false
  );
}

/**
 * A test case written elsewhere can fill what a test-case suggestion offers,
 * and publishes no agent message, so the task views that show one refetch.
 * Other tasks' agent state stays as it is.
 */
export function invalidateTestCaseSuggestions(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: agentKeys.tasks,
    predicate: showsTestCasesSuggestion,
  });
}
