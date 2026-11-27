export const START_BLOCKERS = [
  "archived",
  "in_triage",
  "run_in_progress",
] as const;
export type StartBlocker = (typeof START_BLOCKERS)[number];

export const START_PULL_REQUEST_STATES = [
  "opens",
  "no_repository",
  "runner_missing",
  "runner_cannot_push",
] as const;
export type StartPullRequestState = (typeof START_PULL_REQUEST_STATES)[number];

// What a Start did about a pull request.
export const START_PULL_REQUEST_RESULTS = [
  "queued",
  "not_requested",
  "no_repository",
  "runner_missing",
  "runner_cannot_push",
] as const;
export type StartPullRequestResult =
  (typeof START_PULL_REQUEST_RESULTS)[number];

/**
 * Why Start is unavailable; an empty list means the task can start. Start
 * needs no readiness: it works at any score.
 */
export function computeStartBlockers(input: {
  archived: boolean;
  inTriage: boolean;
  runInProgress: boolean;
}): StartBlocker[] {
  const blockers: StartBlocker[] = [];
  if (input.archived) blockers.push("archived");
  if (input.inTriage) blockers.push("in_triage");
  if (input.runInProgress) blockers.push("run_in_progress");
  return blockers;
}

/**
 * Whether Start also opens a draft pull request. Without a repository, or a
 * runner holding GitHub write credentials, it only moves the task.
 */
export function startPullRequestState(input: {
  repository: string | null;
  runner: { canPush: boolean } | null;
}): StartPullRequestState {
  if (!input.repository) return "no_repository";
  if (!input.runner) return "runner_missing";
  return input.runner.canPush ? "opens" : "runner_cannot_push";
}
