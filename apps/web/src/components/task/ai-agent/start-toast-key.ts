import type { AgentStartResult } from "@/fetchers/agent/start-task";

const START_TOAST_KEYS: Record<AgentStartResult["pullRequest"], string> = {
  queued: "tasks:aiAgent.toast.startedWithPullRequest",
  not_requested: "tasks:aiAgent.toast.started",
  no_repository: "tasks:aiAgent.toast.started",
  runner_missing: "tasks:aiAgent.toast.startedNoRunner",
  runner_cannot_push: "tasks:aiAgent.toast.startedNoPush",
};

/** What Start says it did, including why no draft pull request opens. */
export function startToastKey(
  result: Pick<AgentStartResult, "pullRequest">,
): string {
  return START_TOAST_KEYS[result.pullRequest];
}
