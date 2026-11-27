import { withIntegrationTask } from "../services/integration-task-scope";
import { publishEvent } from "../../../events";
import type { GitHubConfig } from "../config";
import { createExternalLink, findExternalLink } from "../services/link-manager";
import { resolvePullRequestTask } from "../services/resolve-pull-request-task";
import { applyPrOpenedStatus } from "../services/apply-pr-opened-status";
import { findAllIntegrationsByRepo } from "../services/task-service";

export type PROpenedPayload = {
  action: string;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    draft: boolean;
    merged: boolean;
    head: {
      ref: string;
    };
    user: { login: string } | null;
  };
  installation?: { id: number };
  repository: {
    id: number;
    owner: { login: string };
    name: string;
  };
};

export async function handlePullRequestOpened(payload: PROpenedPayload) {
  const { pull_request, repository } = payload;

  const integrations = await findAllIntegrationsByRepo(payload);

  const candidates = [];
  for (const integration of integrations) {
    if (!integration.project) {
      continue;
    }

    const config = JSON.parse(integration.config) as GitHubConfig;
    const existingLink = await findExternalLink(
      integration.id,
      "pull_request",
      pull_request.number.toString(),
    );
    if (existingLink) return;

    const task = await resolvePullRequestTask({
      integrationId: integration.id,
      projectId: integration.projectId,
      projectSlug: integration.project.slug,
      config,
      repositoryUrl: `https://github.com/${repository.owner.login}/${repository.name}`,
      pullRequest: pull_request,
    });
    if (task) candidates.push({ integration, config, task });
  }

  const candidate = candidates[0];
  if (candidates.length !== 1 || !candidate) return;
  const { integration, config, task } = candidate;
  const branchName = pull_request.head.ref;

  await withIntegrationTask(
    task.id,
    integration,
    async (database, afterCommit) => {
      const currentTask = await resolvePullRequestTask({
        integrationId: integration.id,
        projectId: integration.projectId,
        projectSlug: integration.project.slug,
        config,
        repositoryUrl: `https://github.com/${repository.owner.login}/${repository.name}`,
        pullRequest: pull_request,
        database,
      });
      if (currentTask?.id !== task.id) return;
      if (
        await findExternalLink(
          integration.id,
          "pull_request",
          pull_request.number.toString(),
          database,
        )
      )
        return;
      await createExternalLink(
        {
          taskId: task.id,
          integrationId: integration.id,
          resourceType: "pull_request",
          externalId: pull_request.number.toString(),
          url: pull_request.html_url,
          title: pull_request.title,
          metadata: {
            state: pull_request.state,
            draft: pull_request.draft,
            merged: pull_request.merged,
            branch: branchName,
            author: pull_request.user?.login,
          },
        },
        database,
      );

      afterCommit(() =>
        publishEvent("task.updated", {
          projectId: integration.projectId,
          taskId: task.id,
        }),
      );

      // A draft only links; marking it ready for review applies the PR-opened rule.
      if (pull_request.draft) return;

      await applyPrOpenedStatus({
        projectId: integration.projectId,
        task: currentTask,
        config,
        database,
        afterCommit,
      });
    },
  );
}
