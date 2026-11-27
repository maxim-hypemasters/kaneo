import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  agentRunEventTable,
  agentRunTable,
  taskAgentAssessmentTable,
} from "../../database/schema";
import { TRIAGE_STATUS } from "../../triage/triage-status";
import { agentError } from "../agent-error";
import { agentBranchName } from "../branch-name";
import { computeShipBlockers } from "../compute-ship-blockers";
import {
  computeStartBlockers,
  startPullRequestState,
} from "../compute-start-blockers";
import { MAX_EVENTS_PER_RUN } from "../constants";
import { readinessVerdict } from "../readiness-verdict";
import type { PermissionCheck } from "../suggestions/load-suggestion-facts";
import { resolveSuggestions } from "../suggestions/resolve-suggestions";
import { loadAgentTask } from "./load-agent-task";
import { loadEffectiveAgentSetting } from "./load-project-agent-setting";
import { loadWorkBranch } from "./load-work-branch";
import { loadWorkRuns } from "./load-work-runs";
import { loadWorkflowColumns } from "./load-workflow-columns";
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

/**
 * Everything the task view shows about the agent, in one read. Suggestions
 * are filtered and named for the caller, whose permissions `can` checks.
 */
export async function getTaskAgent(taskId: string, can: PermissionCheck) {
  const loaded = await loadAgentTask(taskId);
  if (!loaded) throw new HTTPException(404, { message: "Task not found" });
  if (!loaded.task.isWorkItem) throw agentError("AI_AGENT_NOT_WORK_ITEM");
  const { task, clarifications, inputHash } = loaded;

  const [
    setting,
    runner,
    assessment,
    { active, last },
    workflow,
    lastAssess,
    activeAssess,
    workBranch,
  ] = await Promise.all([
    loadEffectiveAgentSetting(task.projectId),
    loadWorkspaceRunner(task.workspaceId),
    loadAssessment(taskId),
    loadWorkRuns(taskId),
    loadWorkflowColumns(task.projectId),
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
    loadWorkBranch(taskId),
  ]);

  const shownRun = active ?? last;
  const [events, suggestions] = await Promise.all([
    shownRun
      ? db
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
      : [],
    assessment
      ? resolveSuggestions({
          task,
          suggestions: assessment.suggestions,
          dismissedKinds: assessment.dismissedSuggestionKinds,
          can,
        })
      : [],
  ]);

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
  const inTriage = task.status === TRIAGE_STATUS;
  const blockers = computeShipBlockers({
    enabled: setting.enabled,
    repository: setting.repository,
    hasRunner: runner !== null,
    archived: task.archived,
    inTriage,
    assessment: current,
    currentInputHash: inputHash,
    shipInProgress: active !== null,
  });
  const startBlockers = computeStartBlockers({
    archived: task.archived,
    inTriage,
    runInProgress: active !== null,
  });

  return {
    enabled: setting.enabled,
    autoAssess: setting.autoAssess,
    assessment: current
      ? {
          score: current.score,
          verdict: current.verdict,
          questions: current.questions,
          suggestions,
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
    workflow: {
      todoStatus: workflow.todo?.slug ?? null,
      inProgress: workflow.inProgress,
    },
    start: {
      canStart: startBlockers.length === 0,
      blockers: startBlockers,
      pullRequest: startPullRequestState({
        repository: setting.repository,
        runner,
      }),
    },
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
        taskType: task.type,
        workBranch,
      }),
      activeRun: active ? toAgentRun(active) : null,
      lastRun: last ? toAgentRun(last) : null,
      events,
    },
  };
}
