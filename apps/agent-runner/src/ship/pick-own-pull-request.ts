export type ListedPullRequest = {
  url: string;
  isCrossRepository?: boolean;
  headRepositoryOwner?: { login?: string } | null;
};

/**
 * The open pull request from the branch in the repository itself. gh's
 * --head matches the branch name in forks too, and a stranger's pull request
 * is not the one to report.
 */
export function pickOwnPullRequest(
  pulls: readonly ListedPullRequest[],
  repository: string,
): string | null {
  const owner = repository.split("/")[0]?.toLowerCase();
  const own = pulls.find(
    (pull) =>
      pull.isCrossRepository === false &&
      pull.headRepositoryOwner?.login?.toLowerCase() === owner,
  );
  return own?.url ?? null;
}
