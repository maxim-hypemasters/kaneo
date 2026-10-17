import { and, eq, inArray, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { projectTable, taskRelationTable, taskTable } from "../database/schema";
import { publishEvent } from "../events";
import { assertProjectAccess } from "../project-access/assert-project-access";
import {
  setTaskFeature,
  setTaskType,
} from "../task/feature-hierarchy/assign-feature";
import { publishFeatureChange } from "../task/feature-hierarchy/publish-feature-change";

// Features replaced subtasks, but published clients (MCP 0.1.13, CLI 0.1.1)
// and older web tabs still speak "subtask" relations. These translate them:
// a task's feature link reads as a subtask relation from the feature, with
// a synthetic id, and creating or deleting one sets or clears the link.
// Remove once those clients are gone.

const PREFIX = "feature:";

export const featureLinkId = (taskId: string, featureId: string) =>
  `${PREFIX}${taskId}:${featureId}`;

export function parseFeatureLinkId(id: string) {
  if (!id.startsWith(PREFIX)) return null;
  const [taskId, featureId] = id.slice(PREFIX.length).split(":");
  return taskId && featureId ? { taskId, featureId } : null;
}

type FeatureLinkRow = {
  id: string;
  featureId: string | null;
  createdAt: Date;
};

export const toFeatureLink = (
  task: FeatureLinkRow & { featureId: string },
) => ({
  id: featureLinkId(task.id, task.featureId),
  sourceTaskId: task.featureId,
  targetTaskId: task.id,
  relationType: "subtask",
  // Membership has no time of its own; the task's creation is the closest.
  createdAt: task.createdAt,
});

const hasFeature = <T extends { featureId: string | null }>(
  task: T,
): task is T & { featureId: string } => task.featureId !== null;

// The links a task takes part in: its own feature, and, for a feature, its
// tasks.
export async function featureLinksOf(taskId: string) {
  const rows = await db
    .select({
      id: taskTable.id,
      featureId: taskTable.featureId,
      createdAt: taskTable.createdAt,
    })
    .from(taskTable)
    .where(or(eq(taskTable.id, taskId), eq(taskTable.featureId, taskId)));
  return rows.filter(hasFeature).map(toFeatureLink);
}

export async function projectFeatureLinks(projectId: string) {
  const rows = await db
    .select({
      id: taskTable.id,
      featureId: taskTable.featureId,
      createdAt: taskTable.createdAt,
    })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId));
  return rows.filter(hasFeature).map(toFeatureLink);
}

// "Make target a subtask of source": the target joins the source's feature.
// A plain source becomes a feature first; a source that is itself in a
// feature hands the target to that feature and keeps a related link between
// the two, as the conversion of existing subtasks does.
export async function linkSubtaskAsFeature({
  sourceTaskId,
  targetTaskId,
  userId,
  workspaceId,
}: {
  sourceTaskId: string;
  targetTaskId: string;
  userId: string;
  workspaceId: string;
}) {
  const result = await db.transaction(async (tx) => {
    const locked = await tx
      .select({ task: taskTable })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(
        and(
          inArray(taskTable.id, [sourceTaskId, targetTaskId]),
          eq(projectTable.workspaceId, workspaceId),
        ),
      )
      .orderBy(taskTable.id)
      .for("update", { of: taskTable });
    let source = locked.find(({ task }) => task.id === sourceTaskId)?.task;
    const target = locked.find(({ task }) => task.id === targetTaskId)?.task;
    if (!source) {
      throw new HTTPException(404, { message: "Source task not found" });
    }
    if (!target) {
      throw new HTTPException(404, { message: "Target task not found" });
    }
    await assertProjectAccess(userId, target.projectId);
    if (source.projectId !== target.projectId) {
      throw new HTTPException(409, {
        message:
          "Subtasks are now tasks of a feature, which must be in the feature's project",
      });
    }
    if (target.type === "feature") {
      throw new HTTPException(409, {
        message: "That task is a feature, and a feature can't belong to one",
      });
    }

    let featureId = source.id;
    let promoted = false;
    if (source.type !== "feature") {
      if (source.featureId) {
        featureId = source.featureId;
      } else {
        source = await setTaskType(tx, source, "feature", userId);
        promoted = true;
      }
    }
    if (target.featureId === featureId) {
      throw new HTTPException(409, { message: "This relation already exists" });
    }

    const updated = await setTaskFeature(tx, target, featureId, userId);
    let related: typeof taskRelationTable.$inferSelect | undefined;
    if (featureId !== source.id) {
      const [existing] = await tx
        .select({ id: taskRelationTable.id })
        .from(taskRelationTable)
        .where(
          and(
            eq(taskRelationTable.relationType, "related"),
            or(
              and(
                eq(taskRelationTable.sourceTaskId, source.id),
                eq(taskRelationTable.targetTaskId, target.id),
              ),
              and(
                eq(taskRelationTable.sourceTaskId, target.id),
                eq(taskRelationTable.targetTaskId, source.id),
              ),
            ),
          ),
        );
      if (!existing) {
        [related] = await tx
          .insert(taskRelationTable)
          .values({
            sourceTaskId: source.id,
            targetTaskId: target.id,
            relationType: "related",
          })
          .returning();
      }
    }
    return {
      updated,
      related,
      previousFeatureId: target.featureId,
      promotedId: promoted ? source.id : null,
    };
  });

  const { updated, related, previousFeatureId, promotedId } = result;
  await publishFeatureChange({
    projectId: updated.projectId,
    taskId: updated.id,
    featureIds: [previousFeatureId, updated.featureId, promotedId],
    userId,
  });
  if (related) {
    // Announced the way createTaskRelation announces a related link.
    await publishEvent("task-relation.created", {
      ...related,
      taskId: related.sourceTaskId,
      projectId: updated.projectId,
      userId,
    });
  }
  return toFeatureLink({ ...updated, featureId: updated.featureId as string });
}

// Takes the task out of the feature named by a synthetic id, if it's still
// in it. Deleting a link that no longer holds succeeds without a change: an
// older web tab moving a task "creates the new link, then deletes the old".
export async function unlinkFeatureLink(
  id: string,
  userId: string,
  workspaceId: string,
) {
  const link = parseFeatureLinkId(id);
  if (!link) {
    throw new HTTPException(404, { message: "Task relation not found" });
  }
  const { before, after } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ task: taskTable })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(
        and(
          eq(taskTable.id, link.taskId),
          eq(projectTable.workspaceId, workspaceId),
        ),
      )
      .for("update", { of: taskTable });
    if (!row) {
      throw new HTTPException(404, { message: "Task relation not found" });
    }
    await assertProjectAccess(userId, row.task.projectId);
    if (row.task.featureId !== link.featureId) {
      return { before: row.task, after: row.task };
    }
    return {
      before: row.task,
      after: await setTaskFeature(tx, row.task, null, userId),
    };
  });
  if (before.featureId !== after.featureId) {
    await publishFeatureChange({
      projectId: after.projectId,
      taskId: after.id,
      featureIds: [before.featureId],
      userId,
    });
  }
  return {
    id,
    sourceTaskId: link.featureId,
    targetTaskId: link.taskId,
    relationType: "subtask",
    createdAt: before.createdAt,
  };
}
