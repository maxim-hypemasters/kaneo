import { and, asc, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  agentRunEventTable,
  agentRunTable,
  taskAgentAssessmentTable,
  userTable,
} from "../../database/schema";
import { agentError } from "../agent-error";
import { agentBranchName } from "../branch-name";
import { computeShipBlockers } from "../compute-ship-blockers";
import { MAX_EVENTS_PER_RUN } from "../constants";
import { readinessVerdict } from "../readiness-verdict";
import { loadAgentTask } from "./load-agent-task";
import { loadEffectiveAgentSetting } from "./load-project-agent-setting";
import { isRunnerOnline, loadWorkspaceRunner } from "./load-workspace-runner";
import { toAgentRun } from "./to-agent-run";

const ACTIVE = ["queued", "running"] as const;

export async function loadAssessment(taskId: string) {
  const [row] = await db
    .select()
    .from(taskAgentAssessmentTable)
    .where(eq(taskAgentAssessmentTable.taskId, taskId))
    .limit(1);
  return row ?? null;
}

async function loadShipRuns(taskId: string) {
  return db
    .select({
      ...getTableColumns(agentRunTable),
      requestedByName: userTable.name,
    })
    .from(agentRunTable)
    .leftJoin(userTable, eq(agentRunTable.requestedByUserId, userTable.id))
    .where(
      and(eq(agentRunTable.taskId, taskId), eq(agentRunTable.kind, "ship")),
    )
    .orderBy(desc(agentRunTable.createdAt))
    .limit(2);
}

/** Everything the task view shows about the agent, in one read. */
export async function getTaskAgent(taskId: string) {
  const loaded = await loadAgentTask(taskId);
  if (!loaded) throw new HTTPException(404, { message: "Task not found" });
  if (!loaded.task.isWorkItem) throw agentError("AI_AGENT_NOT_WORK_ITEM");
  const { task, clarifications, inputHash } = loaded;

  const [setting, runner, assessment, shipRuns, lastAssess, activeAssess] =
    await Promise.all([
      loadEffectiveAgentSetting(task.projectId),
      loadWorkspaceRunner(task.workspaceId),
      loadAssessment(taskId),
      loadShipRuns(taskId),
      db
        .select({
          status: agentRunTable.status,
          errorCode: agentRunTable.errorCode,
          error: agentRunTable.error,
          finishedAt: agentRunTable.finishedAt,
          inputHash: agentRunTable.inputHash,
        })
        .from(agentRunTable)
        .where(
          and(
            eq(agentRunTable.taskId, taskId),
            eq(agentRunTable.kind, "assess"),
            inArray(agentRunTable.status, ["succeeded", "failed"]),
          ),
        )
        .orderBy(desc(agentRunTable.createdAt))
        .limit(1),
      db
        .select({
          status: agentRunTable.status,
          notBefore: agentRunTable.notBefore,
        })
        .from(agentRunTable)
        .where(
          and(
            eq(agentRunTable.taskId, taskId),
            eq(agentRunTable.kind, "assess"),
            inArray(agentRunTable.status, [...ACTIVE]),
          ),
        )
        // "running" sorts before "queued": a running check is not scheduled.
        .orderBy(desc(agentRunTable.status))
        .limit(1),
    ]);

  const [latest, previous] = shipRuns;
  const active =
    latest && (ACTIVE as readonly string[]).includes(latest.status)
      ? latest
      : null;
  const last = active ? (previous ?? null) : (latest ?? null);
  const shownRun = active ?? last;
  const events = shownRun
    ? await db
        .select({
          id: agentRunEventTable.id,
          kind: agentRunEventTable.kind,
          message: agentRunEventTable.message,
          createdAt: agentRunEventTable.createdAt,
        })
        .from(agentRunEventTable)
        .where(eq(agentRunEventTable.runId, shownRun.id))
        .orderBy(asc(agentRunEventTable.id))
        .limit(MAX_EVENTS_PER_RUN)
    : [];

  // The project's current threshold applies, even if it changed after the
  // assessment was made.
  const current = assessment && {
    ...assessment,
    verdict: readinessVerdict({
      score: assessment.score,
      threshold: setting.readyThreshold,
      questions: assessment.questions,
    }),
  };
  const blockers = computeShipBlockers({
    enabled: setting.enabled,
    repository: setting.repository,
    hasRunner: runner !== null,
    archived: task.archived,
    assessment: current,
    currentInputHash: inputHash,
    shipInProgress: active !== null,
  });

  return {
    enabled: setting.enabled,
    autoAssess: setting.autoAssess,
    assessment: current
      ? {
          score: current.score,
          verdict: current.verdict,
          summary: current.summary,
          checklist: current.checklist,
          questions: current.questions,
          suggestions: current.suggestions,
          assessedAt: current.assessedAt,
        }
      : null,
    stale: current !== null && current.inputHash !== inputHash,
    assessing: activeAssess.length > 0,
    // A queued check still inside its edit window starts at this time.
    assessScheduledAt:
      activeAssess[0]?.status === "queued" &&
      activeAssess[0].notBefore.getTime() > Date.now()
        ? activeAssess[0].notBefore
        : null,
    lastAssessFailure:
      lastAssess[0]?.status === "failed"
        ? {
            code: lastAssess[0].errorCode,
            message: lastAssess[0].error,
            at: lastAssess[0].finishedAt,
            sameInput: lastAssess[0].inputHash === inputHash,
          }
        : null,
    clarifications: clarifications.map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
      answeredBy:
        item.answeredById && item.answeredByName
          ? { id: item.answeredById, name: item.answeredByName }
          : null,
      createdAt: item.createdAt,
    })),
    runner: { configured: runner !== null, online: isRunnerOnline(runner) },
    ship: {
      canShip: blockers.length === 0,
      blockers,
      repository: setting.repository,
      baseBranch: setting.baseBranch,
      branchName: agentBranchName({
        pattern: setting.branchPattern,
        projectSlug: task.projectSlug,
        taskNumber: task.number,
        taskTitle: task.title,
      }),
      activeRun: active ? toAgentRun(active) : null,
      lastRun: last ? toAgentRun(last) : null,
      events,
    },
  };
}
