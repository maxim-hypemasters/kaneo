import { and, eq } from "drizzle-orm";
import type { ShipResult } from "../../agent/agent-types";
import {
  loadEffectiveAgentSetting,
  loadGithubBinding,
} from "../../agent/controllers/load-project-agent-setting";
import { postAgentComment } from "../../agent/controllers/post-agent-comment";
import { publishAgentUpdate } from "../../agent/controllers/publish-agent-update";
import db from "../../database";
import { externalLinkTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { finishRun } from "./finish-run";
import { loadRunnerRun, type RunnerRunRef } from "./load-runner-run";

function pullRequestTitle(prUrl: string) {
  const number = prUrl.match(/\/pull\/(\d+)/)?.[1];
  return number ? `Pull request #${number}` : "Pull request";
}

/**
 * Records the pull request. When the project's GitHub integration watches the
 * same repository it links the pull request itself, so no second link is
 * added here.
 */
export async function completeShip(ref: RunnerRunRef, result: ShipResult) {
  const run = await loadRunnerRun(ref, "ship");
  await db.transaction((tx) =>
    finishRun(tx, run, { status: "succeeded", result }),
  );

  const [setting, github] = await Promise.all([
    loadEffectiveAgentSetting(run.projectId),
    loadGithubBinding(run.projectId),
  ]);
  if (github?.repository !== setting.repository) {
    const [existing] = await db
      .select({ id: externalLinkTable.id })
      .from(externalLinkTable)
      .where(
        and(
          eq(externalLinkTable.taskId, run.taskId),
          eq(externalLinkTable.url, result.prUrl),
        ),
      )
      .limit(1);
    if (!existing) {
      await db.insert(externalLinkTable).values({
        taskId: run.taskId,
        integrationId: null,
        resourceType: "url",
        externalId: result.prUrl,
        url: result.prUrl,
        title: pullRequestTitle(result.prUrl),
      });
      await publishEvent("task.updated", {
        taskId: run.taskId,
        projectId: run.projectId,
        userId: run.requestedByUserId ?? "",
        linksChanged: true,
      });
    }
  }

  // A later Ship can push to the same pull request; keyed to the run, each
  // run's comment is kept.
  await postAgentComment({
    taskId: run.taskId,
    projectId: run.projectId,
    content:
      `Pushed to [${pullRequestTitle(result.prUrl)}](${result.prUrl}) from \`${result.branch}\`.\n\n${result.summary}`.trim(),
    externalUrl: `${result.prUrl}#kaneo-run-${run.id}`,
  });
  await publishAgentUpdate(run.taskId, run.projectId);
}
