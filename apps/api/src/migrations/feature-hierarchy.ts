import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import db from "../database";
import {
  legacySubtaskRelationTable,
  projectTable,
  taskRelationTable,
  taskTable,
} from "../database/schema";
import {
  pairKey,
  resolveFeatureHierarchy,
} from "../task/feature-hierarchy/resolve-feature-hierarchy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Bound the ids in one statement well below PostgreSQL's parameter limit.
const CHUNK = 1000;

function chunks<T>(items: readonly T[]) {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK) {
    result.push(items.slice(start, start + CHUNK));
  }
  return result;
}

// Keeps a converted task's updated_at (and so its calendar LAST-MODIFIED):
// the conversion isn't an edit anyone made.
const keepUpdatedAt = sql`${taskTable.updatedAt}`;

// Replaces legacy "subtask" relations with features (see
// resolve-feature-hierarchy.ts), keeping each converted row in
// legacy_subtask_relation for a manual undo (feature-hierarchy-undo.sql).
//
// Runs on every start: an older server still running during a rolling update
// can write new subtask rows, or move tasks away from their feature, and the
// next start picks those up. A project that fails keeps its subtask rows and
// is retried next time, so it can't keep the server from starting.
export async function migrateFeatureHierarchy() {
  await db.transaction(async (coordinator) => {
    await coordinator.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('feature-hierarchy-migration-v1'))`,
    );
    // Before converting, so a stale link can't hide a task from its new
    // parent; and again after, for what an older server wrote meanwhile.
    await repairOrLog();
    const projects = await coordinator
      .selectDistinct({ id: taskTable.projectId })
      .from(taskRelationTable)
      .innerJoin(taskTable, eq(taskTable.id, taskRelationTable.sourceTaskId))
      .where(eq(taskRelationTable.relationType, "subtask"));
    for (const project of projects) {
      try {
        await db.transaction((tx) => convertProject(tx, project.id));
      } catch (error) {
        console.error(
          `Couldn't convert the subtasks of project ${project.id} into features; they are kept and retried on the next start.`,
          error,
        );
      }
    }
    await repairOrLog();
  });
}

async function repairOrLog() {
  try {
    await repairFeatureMemberships(db);
  } catch (error) {
    console.error("Couldn't check task feature links.", error);
  }
}

async function convertProject(tx: Tx, projectId: string) {
  // Old servers lock the project FOR SHARE while creating a relation, so
  // this waits for them and keeps new subtask rows out until it commits.
  await tx.execute(
    sql`SELECT 1 FROM ${projectTable} WHERE ${projectTable.id} = ${projectId} FOR UPDATE`,
  );
  // The resolver trusts every feature link it reads; with the project locked
  // none can go stale before this commits.
  await repairFeatureMemberships(tx, projectId);
  const edges = await tx
    .select({
      id: taskRelationTable.id,
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
      createdAt: taskRelationTable.createdAt,
    })
    .from(taskRelationTable)
    .innerJoin(taskTable, eq(taskTable.id, taskRelationTable.sourceTaskId))
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(taskRelationTable.relationType, "subtask"),
      ),
    )
    .for("update", { of: taskRelationTable });
  if (edges.length === 0) return;

  const tasks = await tx
    .select({
      id: taskTable.id,
      type: taskTable.type,
      featureId: taskTable.featureId,
    })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId));

  const linked = [
    ...new Set(edges.flatMap((edge) => [edge.sourceTaskId, edge.targetTaskId])),
  ];
  const relatedPairs = new Set<string>();
  for (const ids of chunks(linked)) {
    const rows = await tx
      .select({
        sourceTaskId: taskRelationTable.sourceTaskId,
        targetTaskId: taskRelationTable.targetTaskId,
      })
      .from(taskRelationTable)
      .where(
        and(
          eq(taskRelationTable.relationType, "related"),
          or(
            inArray(taskRelationTable.sourceTaskId, ids),
            inArray(taskRelationTable.targetTaskId, ids),
          ),
        ),
      );
    for (const row of rows) {
      relatedPairs.add(pairKey(row.sourceTaskId, row.targetTaskId));
    }
  }

  const plan = resolveFeatureHierarchy({ tasks, edges, relatedPairs });

  // A row backed up by an earlier conversion (undone since) takes this
  // conversion's outcome, so the undo restores what this one changed.
  for (const batch of chunks(edges)) {
    await tx
      .insert(legacySubtaskRelationTable)
      .values(
        batch.map((edge) => ({
          ...edge,
          outcome: plan.outcomes.get(edge.id) ?? "related",
        })),
      )
      .onConflictDoUpdate({
        target: legacySubtaskRelationTable.id,
        set: {
          outcome: sql`excluded.outcome`,
          convertedAt: sql`excluded.converted_at`,
        },
      });
  }

  // The project guard keeps a task moved away meanwhile out of the feature;
  // features first, so the members' CHECK sees a feature.
  for (const ids of chunks(plan.features)) {
    await tx
      .update(taskTable)
      .set({ type: "feature", updatedAt: keepUpdatedAt })
      .where(
        and(
          inArray(taskTable.id, ids),
          eq(taskTable.projectId, projectId),
          isNull(taskTable.featureId),
        ),
      );
  }
  // One statement per chunk of memberships, however many features they join.
  // Release ids are left alone: a task linked here doesn't take its feature's
  // release the way joining one through the API does.
  for (const batch of chunks([...plan.memberships])) {
    const planned = sql.join(
      batch.map(([taskId, featureId]) => sql`(${taskId}, ${featureId})`),
      sql`, `,
    );
    await tx.execute(sql`
      UPDATE ${taskTable} AS member
      SET feature_id = planned.feature_id, updated_at = member.updated_at
      FROM (VALUES ${planned}) AS planned (id, feature_id)
      WHERE member.id = planned.id
        AND member.project_id = ${projectId}
        AND member.type IN ('task', 'bug')
        AND member.feature_id IS NULL
    `);
  }

  const toRelated = edges
    .filter((edge) => plan.outcomes.get(edge.id) === "related")
    .map((edge) => edge.id);
  const toDelete = edges
    .filter((edge) => plan.outcomes.get(edge.id) !== "related")
    .map((edge) => edge.id);
  for (const ids of chunks(toRelated)) {
    await tx
      .update(taskRelationTable)
      .set({ relationType: "related" })
      .where(inArray(taskRelationTable.id, ids));
  }
  for (const ids of chunks(toDelete)) {
    await tx
      .delete(taskRelationTable)
      .where(inArray(taskRelationTable.id, ids));
  }
}

// A feature link must point at a feature in the task's own project. Only an
// older server can break that (by moving a task or a feature between
// projects), so this clears such links instead of trusting them. Each cleared
// pair keeps a related link, as the conversion does for a cross-project
// subtask link, so the grouping isn't lost. With `projectId`, only that
// project's tasks are checked.
export async function repairFeatureMemberships(
  executor: Tx | typeof db,
  projectId?: string,
) {
  const inProject = projectId
    ? sql`AND member.project_id = ${projectId}`
    : sql``;
  // One statement, so every link it clears gets its related link. The UPDATE
  // checks the link again, so a task an older server moves back meanwhile
  // keeps its feature (and gets no related link).
  const result = await executor.execute<{ cleared: number; kept: number }>(sql`
    WITH broken AS (
      SELECT member.id AS member_id, member.feature_id
      FROM ${taskTable} AS member
      JOIN ${taskTable} AS feature ON feature.id = member.feature_id
      WHERE (feature.project_id <> member.project_id OR feature.type <> 'feature')
        ${inProject}
    ),
    cleared AS (
      UPDATE ${taskTable} AS member
      SET feature_id = NULL, updated_at = member.updated_at
      FROM broken
      JOIN ${taskTable} AS feature ON feature.id = broken.feature_id
      WHERE member.id = broken.member_id
        AND member.feature_id = broken.feature_id
        AND (feature.project_id <> member.project_id OR feature.type <> 'feature')
      RETURNING broken.feature_id, broken.member_id
    ),
    kept AS (
      INSERT INTO ${taskRelationTable} (id, source_task_id, target_task_id, relation_type, created_at)
      SELECT 'feature-repair-' || cleared.feature_id || '-' || cleared.member_id,
        cleared.feature_id, cleared.member_id, 'related', now() AT TIME ZONE 'utc'
      FROM cleared
      WHERE NOT EXISTS (
        SELECT 1 FROM ${taskRelationTable} AS relation
        WHERE relation.relation_type = 'related'
          AND (
            (relation.source_task_id = cleared.feature_id AND relation.target_task_id = cleared.member_id)
            OR (relation.source_task_id = cleared.member_id AND relation.target_task_id = cleared.feature_id)
          )
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM cleared)::int AS cleared,
      (SELECT count(*) FROM kept)::int AS kept
  `);
  const { cleared = 0, kept = 0 } = result.rows[0] ?? {};
  if (cleared) {
    console.log(
      `Cleared ${cleared} feature link(s) that pointed outside a task's project, adding ${kept} related link(s) in their place.`,
    );
  }
}
