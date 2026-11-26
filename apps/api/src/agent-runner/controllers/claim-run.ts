import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AgentRunKind } from "../../agent/agent-types";
import {
  MAX_RUN_ATTEMPTS,
  RUN_LEASE_MS,
  RUNNER_SEEN_THROTTLE_MS,
} from "../../agent/constants";
import { cancelAbandonedRuns } from "../../agent/controllers/cancel-abandoned-runs";
import { loadAgentTask } from "../../agent/controllers/load-agent-task";
import { publishAgentUpdate } from "../../agent/controllers/publish-agent-update";
import db from "../../database";
import {
  agentRunTable,
  projectAgentSettingTable,
  projectTable,
  taskTable,
  workspaceAgentRunnerTable,
} from "../../database/schema";
import { buildRunContext } from "./build-run-context";
import { failOutdatedShip } from "./fail-outdated-ship";

const utcNow = sql`(now() AT TIME ZONE 'utc')`;
const leaseEnd = sql`(now() AT TIME ZONE 'utc') + ${`${RUN_LEASE_MS} milliseconds`}::interval`;

async function markSeen(workspaceId: string, runnerVersion?: string) {
  await db
    .update(workspaceAgentRunnerTable)
    .set({ lastSeenAt: utcNow, runnerVersion: runnerVersion ?? null })
    .where(
      and(
        eq(workspaceAgentRunnerTable.workspaceId, workspaceId),
        or(
          sql`${workspaceAgentRunnerTable.lastSeenAt} is null`,
          lt(
            workspaceAgentRunnerTable.lastSeenAt,
            sql`(now() AT TIME ZONE 'utc') - ${`${RUNNER_SEEN_THROTTLE_MS} milliseconds`}::interval`,
          ),
        ),
      ),
    );
}

// Runs of this workspace's tasks, whatever their project's setting.
const allWorkspaceRuns = (workspaceId: string) =>
  inArray(
    agentRunTable.taskId,
    db
      .select({ id: taskTable.id })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(eq(projectTable.workspaceId, workspaceId)),
  );

// Runs of this workspace's tasks in projects that have the agent on.
const workspaceRuns = (workspaceId: string) =>
  inArray(
    agentRunTable.taskId,
    db
      .select({ id: taskTable.id })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .innerJoin(
        projectAgentSettingTable,
        eq(projectAgentSettingTable.projectId, projectTable.id),
      )
      .where(
        and(
          eq(projectTable.workspaceId, workspaceId),
          eq(projectAgentSettingTable.enabled, true),
        ),
      ),
  );

const leaseExpired = and(
  eq(agentRunTable.status, "running"),
  lt(agentRunTable.leaseExpiresAt, utcNow),
);

/**
 * Takes the next due run for this workspace, or one whose runner stopped
 * heartbeating. SKIP LOCKED lets several runners and API replicas poll at
 * once without taking the same run.
 */
export async function claimRun(
  workspaceId: string,
  kinds: readonly AgentRunKind[],
  runnerVersion?: string,
) {
  await markSeen(workspaceId, runnerVersion);

  // A cancel asked for while no runner held the run ends it here, before it
  // could be reclaimed or failed. Projects turned off are included: turning
  // the agent off asks their running work to stop.
  await cancelAbandonedRuns(
    and(
      isNotNull(agentRunTable.cancelRequestedAt),
      allWorkspaceRuns(workspaceId),
    ),
  );

  // Runs that outlived their attempts fail instead of looping forever.
  const expired = await db
    .update(agentRunTable)
    .set({
      status: "failed",
      errorCode: "lease_expired",
      error: "The runner stopped reporting progress",
      leaseExpiresAt: null,
      finishedAt: utcNow,
    })
    .where(
      and(
        leaseExpired,
        sql`${agentRunTable.attempts} >= ${MAX_RUN_ATTEMPTS}`,
        workspaceRuns(workspaceId),
      ),
    )
    .returning({ taskId: agentRunTable.taskId });
  for (const run of expired) {
    const loaded = await loadAgentTask(run.taskId);
    if (loaded) await publishAgentUpdate(run.taskId, loaded.task.projectId);
  }

  // One assessment per task at a time, so an older one never lands last.
  const sibling = alias(agentRunTable, "sibling");
  const candidate = db
    .select({ id: agentRunTable.id })
    .from(agentRunTable)
    .where(
      and(
        inArray(agentRunTable.kind, [...kinds]),
        or(
          and(
            eq(agentRunTable.status, "queued"),
            lte(agentRunTable.notBefore, utcNow),
          ),
          // A lease can expire after the sweeps above; such a run waits for
          // the next poll rather than being resumed past a cancel or its cap.
          and(
            leaseExpired,
            isNull(agentRunTable.cancelRequestedAt),
            lt(agentRunTable.attempts, MAX_RUN_ATTEMPTS),
          ),
        ),
        workspaceRuns(workspaceId),
        sql`not ${exists(
          db
            .select({ id: sibling.id })
            .from(sibling)
            .where(
              and(
                eq(sibling.taskId, agentRunTable.taskId),
                eq(sibling.kind, "assess"),
                eq(agentRunTable.kind, "assess"),
                eq(sibling.status, "running"),
                sql`${sibling.id} <> ${agentRunTable.id}`,
                sql`${sibling.leaseExpiresAt} >= ${utcNow}`,
              ),
            ),
        )}`,
      ),
    )
    .orderBy(agentRunTable.notBefore, agentRunTable.createdAt)
    .limit(1)
    .for("update", { of: agentRunTable, skipLocked: true });

  const [run] = await db
    .update(agentRunTable)
    .set({
      status: "running",
      attempts: sql`${agentRunTable.attempts} + 1`,
      leaseExpiresAt: leaseEnd,
      startedAt: sql`coalesce(${agentRunTable.startedAt}, ${utcNow})`,
    })
    .where(inArray(agentRunTable.id, candidate))
    .returning();
  if (!run) return null;

  const context = await buildRunContext(run);
  if (!context) return null;
  if (run.kind === "ship" && context.inputHash !== run.inputHash) {
    await failOutdatedShip(run, context.projectId);
    return null;
  }
  if (run.kind === "assess" && context.inputHash !== run.inputHash) {
    // Assess what the task says now, and record that as the input.
    await db
      .update(agentRunTable)
      .set({ inputHash: context.inputHash })
      .where(eq(agentRunTable.id, run.id));
  }
  await publishAgentUpdate(run.taskId, context.projectId);
  return {
    run: { id: run.id, kind: run.kind, attempt: run.attempts },
    context: context.payload,
  };
}
