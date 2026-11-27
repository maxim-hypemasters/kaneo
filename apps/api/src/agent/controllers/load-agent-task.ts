import { asc, eq } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskAgentClarificationTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { computeInputHash } from "../compute-input-hash";

/** The task fields and answers the agent works from, with their fingerprint. */
export async function loadAgentTask(taskId: string) {
  const [task] = await db
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      number: taskTable.number,
      type: taskTable.type,
      title: taskTable.title,
      description: taskTable.description,
      status: taskTable.status,
      priority: taskTable.priority,
      archivedAt: taskTable.archivedAt,
      userId: taskTable.userId,
      featureId: taskTable.featureId,
      milestoneId: taskTable.milestoneId,
      releaseId: taskTable.releaseId,
      estimateSeconds: taskTable.estimateSeconds,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      projectSlug: projectTable.slug,
      projectName: projectTable.name,
      workspaceId: projectTable.workspaceId,
      planningTimeZone: projectTable.planningTimeZone,
      estimateDayMinutes: projectTable.estimateDayMinutes,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task) return null;

  const clarifications = await db
    .select({
      id: taskAgentClarificationTable.id,
      question: taskAgentClarificationTable.question,
      answer: taskAgentClarificationTable.answer,
      createdAt: taskAgentClarificationTable.createdAt,
      answeredById: userTable.id,
      answeredByName: userTable.name,
    })
    .from(taskAgentClarificationTable)
    .leftJoin(
      userTable,
      eq(taskAgentClarificationTable.answeredByUserId, userTable.id),
    )
    .where(eq(taskAgentClarificationTable.taskId, taskId))
    .orderBy(
      asc(taskAgentClarificationTable.createdAt),
      asc(taskAgentClarificationTable.id),
    );

  return {
    task: {
      ...task,
      number: task.number ?? 0,
      isWorkItem: task.type !== "feature",
      archived: task.archivedAt !== null || task.status === "archived",
      ticketId: `${task.projectSlug.toUpperCase()}-${task.number ?? 0}`,
    },
    clarifications,
    inputHash: computeInputHash({
      type: task.type,
      title: task.title,
      description: task.description,
      clarifications,
    }),
  };
}

export type AgentTask = NonNullable<Awaited<ReturnType<typeof loadAgentTask>>>;
