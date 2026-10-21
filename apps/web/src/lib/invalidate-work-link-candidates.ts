import type { QueryClient } from "@tanstack/react-query";

// Both pickers depend on work identity, ownership, archive state and release.
export function invalidateWorkLinkCandidates(
  client: QueryClient,
  projectId?: string,
  options?: { cancelRefetch?: boolean },
) {
  for (const prefix of [
    "release-link-candidates",
    "feature-create-candidates",
  ]) {
    const filter = { queryKey: projectId ? [prefix, projectId] : [prefix] };
    if (options) void client.invalidateQueries(filter, options);
    else void client.invalidateQueries(filter);
  }
}
