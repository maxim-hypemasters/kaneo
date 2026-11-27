import { TRIAGE_STATUS } from "../../../triage/triage-status";
import type { GitHubConfig } from "../config";
import { applyPrOpenedStatus } from "../services/apply-pr-opened-status";
import { setPullRequestDraft } from "../services/set-pull-request-draft";
import { isTaskInFinalState } from "../services/task-service";
import {
  handlePullRequestOpened,
  type PROpenedPayload,
} from "./pull-request-opened";

export async function handlePullRequestReadyForReview(
  payload: PROpenedPayload,
) {
  const linked = await setPullRequestDraft(
    payload,
    false,
    async ({ integration, task, database, afterCommit }) => {
      // Unlike a new pull request, this never reopens finished or archived
      // work, or bypasses Triage.
      if (
        task.status === "archived" ||
        task.status === TRIAGE_STATUS ||
        (await isTaskInFinalState(task, database))
      )
        return;

      await applyPrOpenedStatus({
        projectId: integration.projectId,
        task,
        config: JSON.parse(integration.config) as GitHubConfig,
        database,
        afterCommit,
      });
    },
  );

  // Nothing linked it as a draft, so treat it as a newly opened pull request.
  if (!linked) await handlePullRequestOpened(payload);
}
