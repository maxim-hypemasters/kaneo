import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { loadProjectAgentSetting } from "../../agent/controllers/load-project-agent-setting";
import {
  postAgentComment,
  STOPPED_COMMENT,
} from "../../agent/controllers/post-agent-comment";
import { publishAgentUpdate } from "../../agent/controllers/publish-agent-update";
import { mergeQuestions } from "../../agent/merge-questions";
import { readinessVerdict } from "../../agent/readiness-verdict";
import db from "../../database";
import { taskAgentAssessmentTable } from "../../database/schema";
import { finishRun } from "./finish-run";
import { loadRunnerRun, type RunnerRunRef } from "./load-runner-run";

type Failure = {
  code: string;
  message: string;
  questions?: Array<{ text: string; options: string[]; blocking: boolean }>;
};

function failureComment(failure: Failure) {
  if (failure.code === "cancelled") return STOPPED_COMMENT;
  const questions = failure.questions?.length
    ? `\n\nI need answers before I can continue:\n${failure.questions
        .map((question) => `- ${question.text}`)
        .join("\n")}`
    : "";
  return `I couldn't finish this task: ${failure.message || failure.code}${questions}`;
}

/**
 * Ends a run that could not finish. Questions a Ship run raises join the
 * task's open questions, so the readiness widget asks them.
 */
export async function failRun(ref: RunnerRunRef, failure: Failure) {
  const run = await loadRunnerRun(ref);
  const setting = await loadProjectAgentSetting(run.projectId);
  const incoming = (failure.questions ?? []).map((question) => ({
    id: createId(),
    ...question,
  }));
  await db.transaction(async (tx) => {
    await finishRun(tx, run, {
      status: failure.code === "cancelled" ? "cancelled" : "failed",
      errorCode: failure.code,
      error: failure.message,
    });
    if (!incoming.length) return;
    const [assessment] = await tx
      .select({
        score: taskAgentAssessmentTable.score,
        questions: taskAgentAssessmentTable.questions,
      })
      .from(taskAgentAssessmentTable)
      .where(eq(taskAgentAssessmentTable.taskId, run.taskId))
      .for("update");
    if (!assessment) return;
    const questions = mergeQuestions(assessment.questions, incoming);
    await tx
      .update(taskAgentAssessmentTable)
      .set({
        questions,
        verdict: readinessVerdict({
          score: assessment.score,
          threshold: setting.readyThreshold,
          questions,
        }),
      })
      .where(eq(taskAgentAssessmentTable.taskId, run.taskId));
  });
  if (run.kind === "ship")
    await postAgentComment({
      taskId: run.taskId,
      projectId: run.projectId,
      content: failureComment(failure),
    });
  await publishAgentUpdate(run.taskId, run.projectId);
}
