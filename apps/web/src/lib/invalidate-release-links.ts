import type { QueryClient } from "@tanstack/react-query";
import type { ReleaseLinkCandidate } from "@/fetchers/release/get-release-link-candidates";

export function invalidateReleaseLinks(
  client: QueryClient,
  projectId: string,
  candidates: readonly ReleaseLinkCandidate[],
) {
  for (const prefix of [
    "tasks",
    "releases",
    "release-progress",
    "feature-milestones",
    "project-features",
    "feature-library",
    "project-task-relations",
    "release-link-candidates",
    "feature-create-candidates",
  ])
    void client.invalidateQueries({ queryKey: [prefix, projectId] });

  const knownIds = new Set(
    candidates.flatMap(({ id, featureId }) => [
      id,
      ...(featureId ? [featureId] : []),
    ]),
  );
  const belongs = (id: unknown) =>
    typeof id === "string" &&
    (knownIds.has(id) ||
      client.getQueryData<{ projectId?: string }>(["task", id])?.projectId ===
        projectId);
  // Milestone followers are resolved by the server, so refresh cached project
  // details too, including work whose release changed with its milestone.
  for (const prefix of ["task", "activities", "task-relations"]) {
    void client.invalidateQueries({
      queryKey: [prefix],
      predicate: (query) => belongs(query.queryKey[1]),
    });
  }
}
