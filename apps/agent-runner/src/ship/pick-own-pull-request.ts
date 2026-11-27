import { hasStartMarker } from "./start-marker";

export type ListedPullRequest = {
  url: string;
  isCrossRepository?: boolean;
  headRepositoryOwner?: { login?: string } | null;
  isDraft?: boolean;
  body?: string | null;
};

export type PullRequest = {
  url: string;
  isDraft: boolean;
  // Start opened it as a draft and no Ship has filled it in since.
  startedByKaneo: boolean;
  // Its description as GitHub has it, which people may have added to.
  body: string;
};

/**
 * The open pull request from the branch in the repository itself. gh's
 * --head matches the branch name in forks too, and a stranger's pull request
 * is not the one to report.
 */
export function pickOwnPullRequest(
  pulls: readonly ListedPullRequest[],
  repository: string,
): PullRequest | null {
  const owner = repository.split("/")[0]?.toLowerCase();
  const own = pulls.find(
    (pull) =>
      pull.isCrossRepository === false &&
      pull.headRepositoryOwner?.login?.toLowerCase() === owner,
  );
  if (!own) return null;
  return {
    url: own.url,
    isDraft: own.isDraft === true,
    startedByKaneo: hasStartMarker(own.body),
    body: own.body ?? "",
  };
}
