import {
  milestoneStatusIsDone,
  recordMilestoneActivity,
} from "../../milestone/planning";
import { recordMilestoneChange } from "../../milestone/membership";
import { and, asc, count, eq, isNotNull, notInArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import createActivities from "../../activity/controllers/create-activities";
import db from "../../database";
import {
  assetTable,
  columnTable,
  externalLinkTable,
  integrationTable,
  projectTable,
  milestoneTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { assertProjectAccess } from "../../project-access/assert-project-access";
import { filterUsersWithProjectAccess } from "../../project-access/filter-users-with-project-access";
import { publishFeatureChange } from "../feature-hierarchy/publish-feature-change";
import { recordFeatureChange } from "../feature-hierarchy/record-feature-change";
import { recordReleaseChange } from "../../release/membership/record-release-change";
import { claimTaskNumber } from "./claim-task-numbers";
import { nextTaskPosition } from "./next-task-position";

function isSameProjectMove(
  sourceProjectId: string,
  destinationProjectId: string,
) {
  return sourceProjectId === destinationProjectId;
}

async function resolveDestinationStatus(
  destinationProjectId: string,
  currentStatus: string,
  requestedStatus?: string,
) {
  const destinationColumns = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      position: columnTable.position,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, destinationProjectId))
    .orderBy(asc(columnTable.position));

  const [firstColumn] = destinationColumns;

  if (!firstColumn) {
    throw new HTTPException(400, {
      message: "Destination project does not have a workflow",
    });
  }

  const requestedColumn = requestedStatus
    ? destinationColumns.find((column) => column.slug === requestedStatus)
    : null;

  if (requestedStatus && !requestedColumn) {
    throw new HTTPException(400, {
      message: "Selected status is not valid for the destination project",
    });
  }

  const matchingCurrentColumn = destinationColumns.find(
    (column) => column.slug === currentStatus,
  );

  return requestedColumn ?? matchingCurrentColumn ?? firstColumn;
}

async function moveTask({
  taskId,
  destinationProjectId,
  destinationStatus,
  currentUserId,
}: {
  taskId: string;
  destinationProjectId: string;
  destinationStatus?: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (isSameProjectMove(existingTask.projectId, destinationProjectId)) {
    throw new HTTPException(400, {
      message: "Task is already in that project",
    });
  }

  const sourceProject = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, existingTask.projectId),
  });
  if (!sourceProject) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  const destinationProject = await db.query.projectTable.findFirst({
    where: and(
      eq(projectTable.id, destinationProjectId),
      eq(projectTable.workspaceId, sourceProject.workspaceId),
    ),
  });
  if (!destinationProject) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  await assertProjectAccess(currentUserId, destinationProjectId);

  if (existingTask.type === "feature" && destinationStatus !== undefined)
    throw new HTTPException(400, {
      message: "Features do not have a workflow status",
    });
  const resolvedColumn =
    existingTask.type === "feature"
      ? { id: null, slug: "planned" }
      : await resolveDestinationStatus(
          destinationProjectId,
          existingTask.status ?? "planned",
          destinationStatus,
        );

  const { movedTask, leftFeatureId } = await db.transaction(async (tx) => {
    for (const projectId of [sourceProject.id, destinationProjectId].sort()) {
      const [project] = await tx
        .select({ id: projectTable.id })
        .from(projectTable)
        .where(
          and(
            eq(projectTable.id, projectId),
            eq(projectTable.workspaceId, sourceProject.workspaceId),
          ),
        )
        .for("key share");
      if (!project)
        throw new HTTPException(409, {
          message: "Project was moved to another workspace, please try again",
        });
    }
    const nextTaskNumber = await claimTaskNumber(destinationProjectId, tx);
    const nextPosition =
      existingTask.type === "feature"
        ? 0
        : await nextTaskPosition(
            tx,
            destinationProjectId,
            resolvedColumn.slug,
            resolvedColumn.id,
          );

    // Read under the lock, so a feature or release the task joined since
    // the read above is the one it leaves (and the one whose progress
    // changes).
    const [current] = await tx
      .select({
        featureId: taskTable.featureId,
        milestoneId: taskTable.milestoneId,
        releaseId: taskTable.releaseId,
      })
      .from(taskTable)
      .where(
        and(
          eq(taskTable.id, taskId),
          eq(taskTable.projectId, sourceProject.id),
        ),
      )
      .for("update");
    if (!current) {
      throw new HTTPException(409, {
        message: "Task was moved concurrently, please try again",
      });
    }

    const [updatedTask] = await tx
      .update(taskTable)
      .set({
        projectId: destinationProjectId,
        status: existingTask.type === "feature" ? null : resolvedColumn.slug,
        columnId: existingTask.type === "feature" ? null : resolvedColumn.id,
        number: nextTaskNumber,
        position: nextPosition,
        // Features and releases stay within a project, so the task leaves
        // both.
        featureId: null,
        milestoneId: null,
        releaseId: null,
      })
      .where(
        and(
          eq(taskTable.id, taskId),
          eq(taskTable.projectId, sourceProject.id),
        ),
      )
      .returning();

    if (!updatedTask) {
      throw new HTTPException(409, {
        message: "Task was moved concurrently, please try again",
      });
    }

    // Counted after the update holds the feature's row lock, so a task can't
    // join it meanwhile (joining locks the feature FOR SHARE).
    if (updatedTask.type === "feature") {
      const [members] = await tx
        .select({ count: count() })
        .from(taskTable)
        .where(eq(taskTable.featureId, taskId));
      if ((members?.count ?? 0) > 0) {
        throw new HTTPException(409, {
          message:
            "This feature still has tasks. Take them out of it before moving it to another project.",
        });
      }
    }

    if (updatedTask.type === "feature") {
      const [first] = await tx
        .select()
        .from(columnTable)
        .where(
          and(
            eq(columnTable.projectId, destinationProjectId),
            eq(columnTable.isFinal, false),
          ),
        )
        .orderBy(asc(columnTable.position), asc(columnTable.id))
        .limit(1);
      const milestones = await tx
        .select()
        .from(milestoneTable)
        .where(eq(milestoneTable.featureId, taskId))
        .orderBy(asc(milestoneTable.id))
        .for("update");
      const reset = {
        columnId: first?.id ?? null,
        status: first?.slug ?? "planned",
        releaseId: null,
        leadId: null,
      };
      await tx
        .update(milestoneTable)
        .set(reset)
        .where(eq(milestoneTable.featureId, taskId));
      for (const milestone of milestones) {
        const changes = Object.fromEntries(
          Object.entries(reset)
            .filter(
              ([key, value]) =>
                milestone[key as keyof typeof milestone] !== value,
            )
            .map(([key, value]) => [
              key,
              { from: milestone[key as keyof typeof milestone], to: value },
            ]),
        );
        if (Object.keys(changes).length)
          await recordMilestoneActivity(
            tx,
            taskId,
            milestone,
            "milestone_updated",
            currentUserId,
            changes,
            sourceProject.id,
          );
        if (await milestoneStatusIsDone(tx, sourceProject.id, milestone))
          await recordMilestoneActivity(
            tx,
            taskId,
            milestone,
            "milestone_reopened",
            currentUserId,
            {},
            sourceProject.id,
          );
      }
    }

    await recordMilestoneChange(tx, {
      taskIds: [taskId],
      projectId: sourceProject.id,
      from: current.milestoneId,
      to: null,
      userId: currentUserId,
    });
    if (current.featureId) {
      await recordFeatureChange(tx, {
        taskIds: [taskId],
        projectId: sourceProject.id,
        from: current.featureId,
        to: null,
        userId: currentUserId,
      });
    }

    await recordReleaseChange(tx, {
      taskIds: [taskId],
      projectId: sourceProject.id,
      from: current.releaseId,
      to: null,
      userId: currentUserId,
    });

    let movedTask = updatedTask;
    const assigneeId = updatedTask.userId;
    if (
      assigneeId &&
      !(
        await filterUsersWithProjectAccess(
          [assigneeId],
          destinationProjectId,
          tx,
        )
      ).has(assigneeId)
    ) {
      const [unassignedTask] = await tx
        .update(taskTable)
        .set({ userId: null })
        .where(eq(taskTable.id, taskId))
        .returning();
      movedTask = unassignedTask ?? { ...updatedTask, userId: null };
      await createActivities(
        [
          {
            taskId,
            type: "unassigned",
            userId: currentUserId,
            content: null,
            eventData: {},
          },
        ],
        tx,
      );
    }

    await tx
      .delete(externalLinkTable)
      .where(
        and(
          eq(externalLinkTable.taskId, taskId),
          isNotNull(externalLinkTable.integrationId),
          notInArray(
            externalLinkTable.integrationId,
            tx
              .select({ id: integrationTable.id })
              .from(integrationTable)
              .where(eq(integrationTable.projectId, destinationProjectId)),
          ),
        ),
      );

    await tx
      .update(assetTable)
      .set({ projectId: destinationProjectId })
      .where(eq(assetTable.taskId, taskId));

    return { movedTask, leftFeatureId: current.featureId };
  });

  await publishEvent("task.moved", {
    taskId,
    type: "moved",
    userId: currentUserId,
    fromProjectId: sourceProject.id,
    fromProjectName: sourceProject.name,
    toProjectId: destinationProject.id,
    toProjectName: destinationProject.name,
    oldStatus: existingTask.status,
    newStatus: movedTask.status,
  });
  if (leftFeatureId) {
    await publishFeatureChange({
      projectId: sourceProject.id,
      featureIds: [leftFeatureId],
      userId: currentUserId,
    });
  }

  return {
    task: movedTask,
    sourceProjectId: sourceProject.id,
    destinationProjectId: destinationProject.id,
  };
}

export default moveTask;
