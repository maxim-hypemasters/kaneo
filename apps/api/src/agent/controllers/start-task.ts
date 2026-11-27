import { ApiError } from "../../errors/api-error";
import db from "../../database";
import { agentRunTable } from "../../database/schema";
import { TRIAGE_STATUS } from "../../triage/triage-status";
import {
  computeStartBlockers,
  type StartPullRequestResult,
  startPullRequestState,
} from "../compute-start-blockers";
import { loadWorkRuns } from "./load-work-runs";
import { loadWorkspaceRunner } from "./load-workspace-runner";
import { moveTaskForWorkRun } from "./move-task-for-work-run";
import { publishAgentUpdate } from "./publish-agent-update";
import { requireAgentTask } from "./require-agent-task";

/**
 * Starts work on a task at any readiness: it moves to In Progress, and when
 * the runner can push, a start run opens a draft pull request on the task's
 * branch. No model is involved.
 */
export async function startTask(
  taskId: string,
  userId: string,
  options: { pullRequest: boolean },
) {
  const { task, inputHash, setting } = await requireAgentTask(taskId);
  const [runner, runs] = await Promise.all([
    loadWorkspaceRunner(task.workspaceId),
    loadWorkRuns(taskId),
  ]);
  const refuse = (reasons: string[]) =>
    new ApiError(409, {
      message: "Work on the task can't start now",
      code: "AI_AGENT_NOT_STARTABLE",
      issues: reasons.map((reason) => ({ path: "start", message: reason })),
    });
  const blockers = computeStartBlockers({
    archived: task.archived,
    inTriage: task.status === TRIAGE_STATUS,
    runInProgress: runs.active !== null,
  });
  if (blockers.length) throw refuse(blockers);

  const state = startPullRequestState({
    repository: setting.repository,
    runner,
  });
  let runId: string | null = null;
  if (options.pullRequest && state === "opens") {
    // The partial unique index allows one queued or running Ship or Start.
    const [run] = await db
      .insert(agentRunTable)
      .values({ taskId, kind: "start", inputHash, requestedByUserId: userId })
      .onConflictDoNothing()
      .returning({ id: agentRunTable.id });
    if (!run) throw refuse(["run_in_progress"]);
    runId = run.id;
  }

  const { moved, status } = await moveTaskForWorkRun(task, userId, runId);
  await publishAgentUpdate(taskId, task.projectId);
  const pullRequest: StartPullRequestResult = !options.pullRequest
    ? "not_requested"
    : state === "opens"
      ? "queued"
      : state;
  return { moved, status, pullRequest };
}
