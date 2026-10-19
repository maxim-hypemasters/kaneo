import { lockAuthorizedProject } from "../../milestone/access-scope";
import { retryTransaction } from "../../utils/retry-transaction";
import { lockMilestone } from "../../milestone/membership";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  assetTable,
  columnTable,
  customFieldDefinitionTable,
  customFieldValueTable,
  labelTable,
  projectTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { contentReferencesAsset } from "../../storage/cleanup-assets";
import { copyTaskAssetObject, deleteS3Object } from "../../storage/s3";
import { filterUsersWithProjectAccess } from "../../project-access/filter-users-with-project-access";
import {
  filterAssignableUsers,
  NOT_ASSIGNABLE,
} from "../../utils/assert-assignable-user";
import {
  assertRequiredCustomFields,
  assertValidTaskStatus,
} from "../validate-task-fields";
import { lockFeature } from "../feature-hierarchy/assign-feature";
import { findLockedRelease } from "../../release/membership/assign-release";
import { publishFeatureChange } from "../feature-hierarchy/publish-feature-change";
import { claimTaskNumber } from "./claim-task-numbers";
import { nextTaskPosition } from "./next-task-position";

async function discardCopiedObjects(objectKeys: string[]) {
  await Promise.all(
    objectKeys.map((objectKey) =>
      deleteS3Object(objectKey).catch((error) => {
        console.error("Failed to discard a duplicated task asset:", error);
      }),
    ),
  );
}

// Assets are addressed by `/api/asset/<id>` inside the description, so the copy
// needs its own asset rows and stored objects. Sharing the source rows is not an
// option: `asset.objectKey` is unique and deleting the source task cascades to them.
async function duplicateDescriptionAssets({
  sourceTask,
  duplicatedTaskId,
  workspaceId,
}: {
  sourceTask: typeof taskTable.$inferSelect;
  duplicatedTaskId: string;
  workspaceId: string;
}) {
  const description = sourceTask.description;

  if (!description) {
    return { assets: [], description };
  }

  const sourceAssets = await db
    .select()
    .from(assetTable)
    .where(
      and(
        eq(assetTable.taskId, sourceTask.id),
        eq(assetTable.projectId, sourceTask.projectId),
        eq(assetTable.workspaceId, workspaceId),
      ),
    );

  const referencedAssets = sourceAssets.filter((asset) =>
    contentReferencesAsset(description, asset.id),
  );

  const assets: (typeof assetTable.$inferInsert)[] = [];
  let duplicatedDescription = description;

  try {
    for (const asset of referencedAssets) {
      const duplicatedAssetId = createId();
      const objectKey = await copyTaskAssetObject({
        sourceKey: asset.objectKey,
        destination: {
          workspaceId,
          projectId: sourceTask.projectId,
          taskId: duplicatedTaskId,
          surface: asset.surface === "comment" ? "comment" : "description",
          filename: asset.filename,
          contentType: asset.mimeType,
        },
      });

      assets.push({
        id: duplicatedAssetId,
        workspaceId,
        projectId: sourceTask.projectId,
        taskId: duplicatedTaskId,
        objectKey,
        filename: asset.filename,
        mimeType: asset.mimeType,
        size: asset.size,
        kind: asset.kind,
        surface: asset.surface,
        createdBy: asset.createdBy,
      });

      duplicatedDescription = duplicatedDescription.replaceAll(
        `/api/asset/${asset.id}`,
        `/api/asset/${duplicatedAssetId}`,
      );
    }
  } catch (error) {
    await discardCopiedObjects(assets.map((asset) => asset.objectKey));

    console.error("Failed to copy task attachments:", error);
    throw new HTTPException(503, {
      message: "Failed to copy the task attachments",
    });
  }

  return { assets, description: duplicatedDescription };
}

async function duplicateTask({
  taskId,
  currentUserId,
  expectedWorkspaceId,
  title,
}: {
  taskId: string;
  currentUserId: string;
  expectedWorkspaceId?: string;
  title?: string;
}) {
  const sourceTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!sourceTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  const [project] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, sourceTask.projectId))
    .limit(1);

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  if (
    sourceTask.milestoneId &&
    expectedWorkspaceId &&
    project.workspaceId !== expectedWorkspaceId
  )
    throw new HTTPException(409, {
      message: "Project changed workspaces; retry the request",
    });

  await assertValidTaskStatus(sourceTask.status, sourceTask.projectId);
  let assigneeId = sourceTask.userId;
  if (assigneeId) {
    const members = await filterAssignableUsers(
      [assigneeId],
      project.workspaceId,
    );
    if (!members.has(assigneeId)) {
      throw new HTTPException(403, { message: NOT_ASSIGNABLE });
    }
    const permitted = await filterUsersWithProjectAccess(
      [assigneeId],
      sourceTask.projectId,
    );
    if (!permitted.has(assigneeId)) assigneeId = null;
  }
  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, sourceTask.projectId),
      eq(columnTable.slug, sourceTask.status),
    ),
  });

  const fieldDefinitions = await db
    .select()
    .from(customFieldDefinitionTable)
    .where(eq(customFieldDefinitionTable.projectId, sourceTask.projectId));
  const sourceCustomFields = await db
    .select({
      fieldId: customFieldValueTable.fieldId,
      value: customFieldValueTable.value,
    })
    .from(customFieldValueTable)
    .innerJoin(
      customFieldDefinitionTable,
      eq(customFieldValueTable.fieldId, customFieldDefinitionTable.id),
    )
    .where(
      and(
        eq(customFieldValueTable.taskId, sourceTask.id),
        eq(customFieldDefinitionTable.projectId, sourceTask.projectId),
      ),
    );
  const customFields = sourceCustomFields.map(({ fieldId, value }) => ({
    fieldId,
    value: value ?? "",
  }));
  // Older tasks may predate a required field. Apply its current default or fail
  // validation, just as creation does, before copying anything in storage.
  for (const definition of fieldDefinitions) {
    if (!definition.required || !definition.defaultValue?.trim()) continue;
    const existing = customFields.find(
      (field) => field.fieldId === definition.id,
    );
    if (!existing)
      customFields.push({
        fieldId: definition.id,
        value: definition.defaultValue.trim(),
      });
    else if (!existing.value.trim())
      existing.value = definition.defaultValue.trim();
  }
  await assertRequiredCustomFields(sourceTask.projectId, customFields);

  const sourceLabels = await db
    .select({
      name: labelTable.name,
      color: labelTable.color,
      workspaceId: labelTable.workspaceId,
    })
    .from(labelTable)
    .where(
      and(
        eq(labelTable.taskId, sourceTask.id),
        eq(labelTable.workspaceId, project.workspaceId),
      ),
    );

  // The destination object keys embed the new task id, so it is generated up front
  // instead of being left to the insert.
  const duplicatedTaskId = createId();

  const { assets, description } = await duplicateDescriptionAssets({
    sourceTask,
    duplicatedTaskId,
    workspaceId: project.workspaceId,
  });

  let duplicated: { task: typeof taskTable.$inferSelect };

  try {
    duplicated = await retryTransaction(() =>
      db.transaction(async (tx) => {
        if (sourceTask.milestoneId)
          await lockAuthorizedProject(
            tx,
            sourceTask.projectId,
            expectedWorkspaceId,
            "update",
          );
        // A copy of a task stays in its feature; a copy of a feature is an
        // empty feature (a copy is one task, not a tree).
        if (sourceTask.milestoneId) {
          await lockMilestone(
            tx,
            sourceTask.milestoneId,
            sourceTask.featureId,
            sourceTask.projectId,
          );
        }
        if (sourceTask.featureId) {
          await lockFeature(tx, sourceTask.featureId, sourceTask.projectId);
        }
        const taskNumber = await claimTaskNumber(sourceTask.projectId, tx);
        // The copy keeps the source's own release, or none if it was deleted
        // since the source was read.
        const release = sourceTask.releaseId
          ? await findLockedRelease(
              tx,
              sourceTask.releaseId,
              sourceTask.projectId,
            )
          : null;
        const nextPosition = await nextTaskPosition(
          tx,
          sourceTask.projectId,
          sourceTask.status,
          column?.id ?? null,
        );

        const [task] = await tx
          .insert(taskTable)
          .values({
            id: duplicatedTaskId,
            projectId: sourceTask.projectId,
            userId: assigneeId,
            title: title?.trim() || sourceTask.title,
            status: sourceTask.status,
            columnId: column?.id ?? null,
            startDate: sourceTask.startDate,
            dueDate: sourceTask.dueDate,
            description,
            priority: sourceTask.priority,
            number: taskNumber,
            position: nextPosition,
            type: sourceTask.type,
            featureId: sourceTask.featureId,
            milestoneId:
              sourceTask.type === "feature" ? null : sourceTask.milestoneId,
            releaseId: release?.id ?? null,
          })
          .returning();

        if (!task) {
          throw new HTTPException(500, {
            message: "Failed to duplicate task",
          });
        }

        if (customFields.length > 0) {
          await tx
            .insert(customFieldValueTable)
            .values(
              customFields.map((field) => ({ ...field, taskId: task.id })),
            );
        }

        if (sourceLabels.length > 0) {
          await tx.insert(labelTable).values(
            sourceLabels.map((label) => ({
              name: label.name,
              color: label.color,
              taskId: task.id,
              workspaceId: label.workspaceId,
            })),
          );
        }

        if (assets.length > 0) {
          await tx.insert(assetTable).values(assets);
        }

        return { task };
      }),
    );
  } catch (error) {
    await discardCopiedObjects(assets.map((asset) => asset.objectKey));
    throw error;
  }

  const duplicatedTask = duplicated.task;

  const [assignee] = duplicatedTask.userId
    ? await db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, duplicatedTask.userId))
    : [];

  await publishEvent("task.created", {
    ...duplicatedTask,
    taskId: duplicatedTask.id,
    userId: duplicatedTask.userId ?? "",
    currentUserId,
    type: "created",
    content: null,
  });

  if (duplicatedTask.featureId) {
    await publishFeatureChange({
      projectId: duplicatedTask.projectId,
      featureIds: [duplicatedTask.featureId],
      userId: currentUserId,
    });
  }

  return {
    ...duplicatedTask,
    assigneeName: assignee?.name,
  };
}

export default duplicateTask;
