import { ApiError } from "../../errors/api-error";
import db from "../../database";
import { agentRunTable } from "../../database/schema";
import { computeShipBlockers } from "../compute-ship-blockers";
import { readinessVerdict } from "../readiness-verdict";
import { loadAssessment } from "./get-task-agent";
import { loadWorkspaceRunner } from "./load-workspace-runner";
import { publishAgentUpdate } from "./publish-agent-update";
import { requireAgentTask } from "./require-agent-task";

/** Queues a Ship run after checking readiness again on the server. */
export async function shipTask(taskId: string, userId: string) {
  const { task, inputHash, setting } = await requireAgentTask(taskId);
  const [assessment, runner] = await Promise.all([
    loadAssessment(taskId),
    loadWorkspaceRunner(task.workspaceId),
  ]);
  const blockers = computeShipBlockers({
    enabled: setting.enabled,
    repository: setting.repository,
    hasRunner: runner !== null,
    archived: task.archived,
    // Judged by the project's threshold now, not the one at assessment time.
    assessment: assessment && {
      ...assessment,
      verdict: readinessVerdict({
        score: assessment.score,
        threshold: setting.readyThreshold,
        questions: assessment.questions,
      }),
    },
    currentInputHash: inputHash,
    shipInProgress: false,
  });
  const refuse = (reasons: string[]) =>
    new ApiError(409, {
      message: "The task is not ready for the AI agent",
      code: "AI_AGENT_NOT_SHIPPABLE",
      issues: reasons.map((reason) => ({ path: "ship", message: reason })),
    });
  if (blockers.length) throw refuse(blockers);

  // The partial unique index allows one queued or running Ship per task.
  const [run] = await db
    .insert(agentRunTable)
    .values({ taskId, kind: "ship", inputHash, requestedByUserId: userId })
    .onConflictDoNothing()
    .returning({ id: agentRunTable.id });
  if (!run) throw refuse(["ship_in_progress"]);

  await publishAgentUpdate(taskId, task.projectId);
  return run;
}
