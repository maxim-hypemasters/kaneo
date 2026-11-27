import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import type { AssessmentResult } from "../../agent/assessment-schema";
import { loadAgentTask } from "../../agent/controllers/load-agent-task";
import { loadProjectAgentSetting } from "../../agent/controllers/load-project-agent-setting";
import { publishAgentUpdate } from "../../agent/controllers/publish-agent-update";
import { readinessVerdict } from "../../agent/readiness-verdict";
import { loadPlanningContext } from "../../agent/suggestions/load-planning-context";
import { parseRecommendations } from "../../agent/suggestions/parse-recommendations";
import { toStoredSuggestions } from "../../agent/suggestions/to-stored-suggestions";
import db from "../../database";
import { taskAgentAssessmentTable } from "../../database/schema";
import { finishRun } from "./finish-run";
import { loadRunnerRun, type RunnerRunRef } from "./load-runner-run";

/**
 * Stores the assessment with the input the run was claimed with. If the task
 * changed meanwhile, the stored hash no longer matches and the view shows it
 * as outdated until the next assessment. Field recommendations are checked
 * against the task's empty fields and candidates as they are now.
 */
export async function completeAssessment(
  ref: RunnerRunRef,
  result: AssessmentResult,
) {
  const run = await loadRunnerRun(ref, ["assess"]);
  const [setting, loaded] = await Promise.all([
    loadProjectAgentSetting(run.projectId),
    loadAgentTask(run.taskId),
  ]);
  const planning = loaded ? await loadPlanningContext(loaded.task) : null;
  const questions = result.questions.map((question) => ({
    id: createId(),
    ...question,
  }));
  const assessment = {
    runId: run.id,
    score: result.score,
    verdict: readinessVerdict({
      score: result.score,
      threshold: setting.readyThreshold,
      questions,
    }),
    questions,
    assessedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    // The hash of the row this attempt finished, not of an earlier read.
    const { inputHash } = await finishRun(tx, run, { status: "succeeded" });
    // Locked, so a dismissal meanwhile is honoured; the kinds stay as they are.
    const [existing] = await tx
      .select({ dismissed: taskAgentAssessmentTable.dismissedSuggestionKinds })
      .from(taskAgentAssessmentTable)
      .where(eq(taskAgentAssessmentTable.taskId, run.taskId))
      .for("update");
    const values = {
      ...assessment,
      suggestions: toStoredSuggestions({
        suggestions: result.suggestions,
        recommendations: parseRecommendations(result.recommendations),
        planning,
        dismissedKinds: existing?.dismissed ?? [],
        task: loaded?.task ?? { featureId: null, milestoneId: null },
      }),
      inputHash,
    };
    await tx
      .insert(taskAgentAssessmentTable)
      .values({ taskId: run.taskId, ...values })
      .onConflictDoUpdate({
        target: taskAgentAssessmentTable.taskId,
        set: values,
      });
  });
  await publishAgentUpdate(run.taskId, run.projectId);
}
