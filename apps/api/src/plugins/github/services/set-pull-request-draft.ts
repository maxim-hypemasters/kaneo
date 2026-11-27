import { publishEvent } from "../../../events";
import type { IntegrationDatabase } from "./integration-task-scope";
import { findExternalLink, updateExternalLink } from "./link-manager";
import {
  findAllIntegrationsByRepo,
  findTaskById,
  type GitHubWebhookSource,
  type TaskRow,
} from "./task-service";
import { withIntegrationLink } from "./with-integration-link";

type Integration = Awaited<
  ReturnType<typeof findAllIntegrationsByRepo>
>[number];

export type LinkedPullRequest = {
  integration: Integration;
  task: TaskRow;
  database: IntegrationDatabase;
  afterCommit: (effect: () => Promise<void>) => void;
};

/**
 * Records the pull request's draft flag on its task link, then hands the
 * locked task to `onLinked`. Returns false when no integration on the
 * repository has linked this pull request yet.
 */
export async function setPullRequestDraft(
  source: GitHubWebhookSource & { pull_request: { number: number } },
  draft: boolean,
  onLinked?: (linked: LinkedPullRequest) => Promise<void>,
): Promise<boolean> {
  const externalId = source.pull_request.number.toString();

  for (const integration of await findAllIntegrationsByRepo(source)) {
    const link = await findExternalLink(
      integration.id,
      "pull_request",
      externalId,
    );
    if (!link) continue;

    await withIntegrationLink(
      link,
      integration,
      async (database, afterCommit) => {
        await updateExternalLink(link.id, { metadata: { draft } }, database);
        afterCommit(() =>
          publishEvent("task.updated", {
            projectId: integration.projectId,
            taskId: link.taskId,
          }),
        );

        const task = await findTaskById(link.taskId, database);
        if (task && onLinked)
          await onLinked({ integration, task, database, afterCommit });
      },
    );
    return true;
  }

  return false;
}
