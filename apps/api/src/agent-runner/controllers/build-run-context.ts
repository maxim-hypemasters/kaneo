import { and, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { agentRunTable } from "../../database/schema";
import { assessmentJsonSchema } from "../../agent/assessment-schema";
import { agentBranchName } from "../../agent/branch-name";
import { CONTEXT_COMMENT_LIMIT } from "../../agent/constants";
import { loadAgentTask } from "../../agent/controllers/load-agent-task";
import { loadEffectiveAgentSetting } from "../../agent/controllers/load-project-agent-setting";
import db from "../../database";
import {
  activityTable,
  columnTable,
  labelTable,
  projectTable,
  taskRelationTable,
  taskTable,
  userTable,
} from "../../database/schema";

const COMMENT_MAX_CHARS = 4000;

// Only the task's own project: every reader of the task can see those, and
// the agent's output is shown to all of them.
async function loadRelatedTasks(taskId: string, projectId: string) {
  const other = alias(taskTable, "other");
  const rows = await db
    .select({
      sourceTaskId: taskRelationTable.sourceTaskId,
      relationType: taskRelationTable.relationType,
      title: other.title,
      number: other.number,
      slug: projectTable.slug,
    })
    .from(taskRelationTable)
    .innerJoin(
      other,
      or(
        and(
          eq(taskRelationTable.sourceTaskId, taskId),
          eq(other.id, taskRelationTable.targetTaskId),
        ),
        and(
          eq(taskRelationTable.targetTaskId, taskId),
          eq(other.id, taskRelationTable.sourceTaskId),
        ),
      ),
    )
    .innerJoin(projectTable, eq(other.projectId, projectTable.id))
    .where(eq(other.projectId, projectId))
    .limit(30);
  return rows.map((row) => ({
    ticketId: `${row.slug.toUpperCase()}-${row.number}`,
    title: row.title,
    relation:
      row.sourceTaskId === taskId
        ? row.relationType
        : `${row.relationType} (incoming)`,
  }));
}

async function loadComments(taskId: string) {
  const rows = await db
    .select({
      content: activityTable.content,
      createdAt: activityTable.createdAt,
      userName: userTable.name,
      externalUserName: activityTable.externalUserName,
    })
    .from(activityTable)
    .leftJoin(userTable, eq(activityTable.userId, userTable.id))
    .where(
      and(eq(activityTable.taskId, taskId), eq(activityTable.type, "comment")),
    )
    .orderBy(desc(activityTable.createdAt))
    .limit(CONTEXT_COMMENT_LIMIT);
  return rows.reverse().map((row) => ({
    author: row.userName ?? row.externalUserName ?? "Unknown",
    content: (row.content ?? "").slice(0, COMMENT_MAX_CHARS),
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Everything a runner needs about the task, read fresh at claim time. */
export async function buildRunContext(run: typeof agentRunTable.$inferSelect) {
  const loaded = await loadAgentTask(run.taskId);
  if (!loaded) return null;
  const { task, clarifications, inputHash } = loaded;
  const [setting, labels, column, comments, relatedTasks] = await Promise.all([
    loadEffectiveAgentSetting(task.projectId),
    db
      .select({ name: labelTable.name })
      .from(labelTable)
      .where(eq(labelTable.taskId, task.id)),
    db
      .select({ name: columnTable.name })
      .from(columnTable)
      .where(
        and(
          eq(columnTable.projectId, task.projectId),
          eq(columnTable.slug, task.status ?? ""),
        ),
      )
      .limit(1),
    loadComments(task.id),
    loadRelatedTasks(task.id, task.projectId),
  ]);
  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";

  return {
    projectId: task.projectId,
    inputHash,
    payload: {
      task: {
        id: task.id,
        ticketId: task.ticketId,
        type: task.type,
        title: task.title,
        description: task.description ?? "",
        priority: task.priority,
        status: column[0]?.name ?? task.status,
        labels: labels.map((label) => label.name),
        url: `${clientUrl}/dashboard/workspace/${task.workspaceId}/project/${task.projectId}/task/${task.id}`,
      },
      comments,
      clarifications: clarifications.map(({ question, answer }) => ({
        question,
        answer,
      })),
      relatedTasks,
      project: {
        name: task.projectName,
        repository: setting.repository,
        baseBranch: setting.baseBranch,
        instructions: setting.instructions,
      },
      branchName: agentBranchName({
        pattern: setting.branchPattern,
        projectSlug: task.projectSlug,
        taskNumber: task.number,
        taskTitle: task.title,
      }),
      resultSchema: run.kind === "assess" ? assessmentJsonSchema() : null,
    },
  };
}
