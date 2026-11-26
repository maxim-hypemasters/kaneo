import { createId } from "@paralleldrive/cuid2";
import type { AssessmentResult } from "../../agent/assessment-schema";
import { loadProjectAgentSetting } from "../../agent/controllers/load-project-agent-setting";
import { publishAgentUpdate } from "../../agent/controllers/publish-agent-update";
import { readinessVerdict } from "../../agent/readiness-verdict";
import db from "../../database";
import { taskAgentAssessmentTable } from "../../database/schema";
import { finishRun } from "./finish-run";
import { loadRunnerRun, type RunnerRunRef } from "./load-runner-run";

/**
 * Stores the assessment with the input the run was claimed with. If the task
 * changed meanwhile, the stored hash no longer matches and the view shows it
 * as outdated until the next assessment.
 */
export async function completeAssessment(
  ref: RunnerRunRef,
  result: AssessmentResult,
) {
  const run = await loadRunnerRun(ref, "assess");
  const setting = await loadProjectAgentSetting(run.projectId);
  const questions = result.questions.map((question) => ({
    id: createId(),
    ...question,
  }));
  const values = {
    runId: run.id,
    score: result.score,
    verdict: readinessVerdict({
      score: result.score,
      threshold: setting.readyThreshold,
      questions,
    }),
    summary: result.summary,
    checklist: result.checklist,
    questions,
    suggestions: result.suggestions.map((suggestion) => ({
      id: createId(),
      ...suggestion,
    })),
    assessedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    // The hash of the row this attempt finished, not of an earlier read.
    const { inputHash } = await finishRun(tx, run, { status: "succeeded" });
    await tx
      .insert(taskAgentAssessmentTable)
      .values({ taskId: run.taskId, ...values, inputHash })
      .onConflictDoUpdate({
        target: taskAgentAssessmentTable.taskId,
        set: { ...values, inputHash },
      });
  });
  await publishAgentUpdate(run.taskId, run.projectId);
}
