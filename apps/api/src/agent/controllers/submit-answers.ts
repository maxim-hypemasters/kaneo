import { eq } from "drizzle-orm";
import db from "../../database";
import {
  taskAgentAssessmentTable,
  taskAgentClarificationTable,
} from "../../database/schema";
import { agentError } from "../agent-error";
import { computeInputHash } from "../compute-input-hash";
import { readinessVerdict } from "../readiness-verdict";
import { publishAgentUpdate } from "./publish-agent-update";
import { requireAgentTask } from "./require-agent-task";
import { scheduleAssessment } from "./schedule-assessment";

/**
 * Records answers as decisions, drops their questions and re-assesses right
 * away, the way answering a plan's questions updates the plan.
 */
export async function submitAnswers(
  taskId: string,
  userId: string,
  answers: ReadonlyArray<{ questionId: string; answer: string }>,
) {
  const { task, clarifications, setting } = await requireAgentTask(taskId);

  const added = await db.transaction(async (tx) => {
    const [assessment] = await tx
      .select()
      .from(taskAgentAssessmentTable)
      .where(eq(taskAgentAssessmentTable.taskId, taskId))
      .for("update");
    if (!assessment) throw agentError("AI_AGENT_QUESTION_NOT_FOUND");

    const byId = new Map(assessment.questions.map((q) => [q.id, q]));
    const answered = answers.map(({ questionId, answer }) => {
      const question = byId.get(questionId);
      if (!question) throw agentError("AI_AGENT_QUESTION_NOT_FOUND");
      return { question: question.text, answer };
    });
    const answeredIds = new Set(answers.map((item) => item.questionId));
    const remaining = assessment.questions.filter(
      (question) => !answeredIds.has(question.id),
    );

    // Decisions are read oldest first; a millisecond apiece keeps the order
    // the questions were asked in.
    const now = Date.now();
    await tx.insert(taskAgentClarificationTable).values(
      answered.map((item, index) => ({
        taskId,
        question: item.question,
        answer: item.answer,
        answeredByUserId: userId,
        createdAt: new Date(now + index),
      })),
    );
    await tx
      .update(taskAgentAssessmentTable)
      .set({
        questions: remaining,
        verdict: readinessVerdict({
          score: assessment.score,
          threshold: setting.readyThreshold,
          questions: remaining,
        }),
      })
      .where(eq(taskAgentAssessmentTable.taskId, taskId));
    return answered;
  });

  const inputHash = computeInputHash({
    type: task.type,
    title: task.title,
    description: task.description,
    clarifications: [...clarifications, ...added],
  });
  await scheduleAssessment(taskId, { inputHash, requestedByUserId: userId });
  await publishAgentUpdate(taskId, task.projectId);
}
