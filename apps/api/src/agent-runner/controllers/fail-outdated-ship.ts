import { and, eq, sql } from "drizzle-orm";
import { postAgentComment } from "../../agent/controllers/post-agent-comment";
import { publishAgentUpdate } from "../../agent/controllers/publish-agent-update";
import { restoreTaskToTodo } from "../../agent/controllers/restore-task-to-todo";
import db from "../../database";
import { agentRunTable } from "../../database/schema";

/**
 * Ends a just-claimed Ship run whose task changed after Ship was requested,
 * before the runner starts it: only the assessed text may be shipped. The
 * work never started, so the task goes back to To Do.
 */
export async function failOutdatedShip(
  run: { id: string; taskId: string; attempts: number; movedTask: boolean },
  projectId: string,
) {
  const [failed] = await db
    .update(agentRunTable)
    .set({
      status: "failed",
      errorCode: "assessment_outdated",
      error: "The task changed after Ship was requested; check readiness again",
      leaseExpiresAt: null,
      finishedAt: sql`(now() AT TIME ZONE 'utc')`,
    })
    .where(
      and(
        eq(agentRunTable.id, run.id),
        eq(agentRunTable.status, "running"),
        eq(agentRunTable.attempts, run.attempts),
      ),
    )
    .returning({ id: agentRunTable.id });
  if (!failed) return;
  await restoreTaskToTodo({ ...run, projectId });
  await postAgentComment({
    taskId: run.taskId,
    projectId,
    content:
      "I didn't start: the task changed after Ship was requested. Check readiness again, then Ship.",
  });
  await publishAgentUpdate(run.taskId, projectId);
}
