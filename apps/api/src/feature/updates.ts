import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
} from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  activityTable,
  columnTable,
  milestoneTable,
  taskTable,
  userTable,
} from "../database/schema";
import { publishEvent } from "../events";
import { milestoneProgress } from "../milestone/progress";
import { redactInaccessibleActivity } from "../activity/redaction/redact-inaccessible-activity";
import { deleteOrphanedAssets } from "../storage/cleanup-assets";
import { boundedTaskRead } from "../task/bounded-read";
import { claimDescriptionAssets } from "../task/controllers/claim-description-assets";
import { retryTransaction } from "../utils/retry-transaction";
import { featureOwner, pagination, type FeatureTransaction } from "./access";
import {
  featureUpdateEventSchema,
  featureReportSchema,
  type FeaturePage,
  type FeatureScope,
  type updateBody,
} from "./schema";
import type { z } from "../openapi";

const activityFields = {
  ...getTableColumns(activityTable),
  userName: userTable.name,
  userImage: userTable.image,
};
async function activity(tx: FeatureTransaction, id: string) {
  const [row] = await tx
    .select(activityFields)
    .from(activityTable)
    .leftJoin(userTable, eq(userTable.id, activityTable.userId))
    .where(eq(activityTable.id, id));
  if (!row)
    throw new HTTPException(404, { message: "Feature update not found" });
  return featureReportSchema.parse(row);
}
export async function readFeatureActivity(
  scope: FeatureScope,
  options: FeaturePage,
) {
  const result = await boundedTaskRead(async (tx) => {
    await featureOwner(tx, scope);
    const where = eq(activityTable.taskId, scope.featureId);
    const [total] = await tx
      .select({ total: count() })
      .from(activityTable)
      .where(where);
    const data = await tx
      .select(activityFields)
      .from(activityTable)
      .leftJoin(userTable, eq(userTable.id, activityTable.userId))
      .where(where)
      .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit);
    return { data, pagination: pagination(total?.total ?? 0, options) };
  });
  return {
    ...result,
    data: await redactInaccessibleActivity(scope.userId, result.data),
  };
}
export async function latestFeatureUpdate(scope: FeatureScope) {
  const result = await boundedTaskRead(async (tx) => {
    await featureOwner(tx, scope);
    const [row] = await tx
      .select(activityFields)
      .from(activityTable)
      .leftJoin(userTable, eq(userTable.id, activityTable.userId))
      .where(
        and(
          eq(activityTable.taskId, scope.featureId),
          eq(activityTable.type, "feature_update"),
        ),
      )
      .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
      .limit(1);
    return row ?? null;
  });
  return result
    ? featureReportSchema.parse(
        (await redactInaccessibleActivity(scope.userId, [result]))[0]!,
      )
    : null;
}
export async function getFeatureUpdate(scope: FeatureScope, id: string) {
  const result = await boundedTaskRead(async (tx) => {
    await featureOwner(tx, scope);
    const [row] = await tx
      .select(activityFields)
      .from(activityTable)
      .leftJoin(userTable, eq(userTable.id, activityTable.userId))
      .where(
        and(
          eq(activityTable.id, id),
          eq(activityTable.taskId, scope.featureId),
          eq(activityTable.type, "feature_update"),
        ),
      );
    if (!row)
      throw new HTTPException(404, { message: "Feature update not found" });
    return row;
  });
  return featureReportSchema.parse(
    (await redactInaccessibleActivity(scope.userId, [result]))[0]!,
  );
}
async function milestoneSnapshots(tx: FeatureTransaction, scope: FeatureScope) {
  const milestones = await tx
    .select({
      id: milestoneTable.id,
      title: milestoneTable.title,
      position: milestoneTable.position,
    })
    .from(milestoneTable)
    .where(eq(milestoneTable.featureId, scope.featureId))
    .orderBy(asc(milestoneTable.position), asc(milestoneTable.id));
  const columns = await tx
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      position: columnTable.position,
      isFinal: columnTable.isFinal,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, scope.projectId));
  const statuses = await tx
    .select({
      milestoneId: taskTable.milestoneId,
      status: taskTable.status,
      count: count(),
    })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, scope.projectId),
        eq(taskTable.featureId, scope.featureId),
        inArray(taskTable.type, ["task", "bug"]),
      ),
    )
    .groupBy(taskTable.milestoneId, taskTable.status);
  const [previous] = await tx
    .select({
      eventData: activityTable.eventData,
      createdAt: activityTable.createdAt,
    })
    .from(activityTable)
    .where(
      and(
        eq(activityTable.taskId, scope.featureId),
        eq(activityTable.type, "feature_update"),
      ),
    )
    .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
    .limit(1);
  const parsed = featureUpdateEventSchema.safeParse(previous?.eventData);
  const past = new Map(
    parsed.success ? parsed.data.milestones.map((row) => [row.id, row]) : [],
  );
  return {
    milestones: milestones.map((row) => ({
      ...row,
      ...milestoneProgress(
        statuses.filter((status) => status.milestoneId === row.id),
        columns,
      ),
      previousTotal: past.get(row.id)?.total ?? null,
      previousCompleted: past.get(row.id)?.completed ?? null,
    })),
    publishedAt: new Date(
      Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1),
    ),
  };
}
export async function publishFeatureUpdate(
  scope: FeatureScope,
  body: z.infer<typeof updateBody>,
) {
  const row = await retryTransaction(() =>
    db.transaction(
      async (tx) => {
        await featureOwner(tx, scope, true);
        const { milestones, publishedAt } = await milestoneSnapshots(tx, scope);
        // Make a waiting repeatable-read publisher retry against the committed
        // previous report, rather than keep the snapshot taken before the lock.
        await tx
          .update(taskTable)
          .set({ updatedAt: publishedAt })
          .where(eq(taskTable.id, scope.featureId));
        await claimDescriptionAssets(tx, {
          taskId: scope.featureId,
          projectId: scope.projectId,
          currentUserId: scope.userId,
          description: body.note,
          draftAssetIds: body.draftAssetIds,
        });
        const [created] = await tx
          .insert(activityTable)
          .values({
            taskId: scope.featureId,
            type: "feature_update",
            userId: scope.userId,
            content: body.note,
            createdAt: publishedAt,
            eventData: {
              projectId: scope.projectId,
              health: body.health,
              milestones,
            },
          })
          .returning({ id: activityTable.id });
        return activity(tx, created!.id);
      },
      { isolationLevel: "repeatable read" },
    ),
  );
  await publishFeatureContent(scope, "feature.update.created", row.id);
  return row;
}
export async function editFeatureUpdate(
  scope: FeatureScope,
  id: string,
  body: z.infer<typeof updateBody> | null,
) {
  const { row, oldContent } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await featureOwner(tx, scope, true);
      const [before] = await tx
        .select()
        .from(activityTable)
        .where(
          and(
            eq(activityTable.id, id),
            eq(activityTable.taskId, scope.featureId),
            eq(activityTable.type, "feature_update"),
          ),
        )
        .for("update");
      if (!before)
        throw new HTTPException(404, { message: "Feature update not found" });
      if (before.userId !== scope.userId)
        throw new HTTPException(403, {
          message: "Only the update author may change it",
        });
      if (body) {
        await claimDescriptionAssets(tx, {
          taskId: scope.featureId,
          projectId: scope.projectId,
          currentUserId: scope.userId,
          description: body.note,
          draftAssetIds: body.draftAssetIds,
        });
        const data = featureUpdateEventSchema.parse(before.eventData);
        await tx
          .update(activityTable)
          .set({
            content: body.note,
            eventData: { ...data, health: body.health },
          })
          .where(eq(activityTable.id, id));
      }
      const row = await activity(tx, id);
      if (!body) await tx.delete(activityTable).where(eq(activityTable.id, id));
      return { row, oldContent: before.content };
    }),
  );
  await publishFeatureContent(
    scope,
    body ? "feature.update.updated" : "feature.update.deleted",
    id,
  );
  void deleteOrphanedAssets(oldContent, body?.note, {
    taskId: scope.featureId,
  }).catch(() => {});
  return featureReportSchema.parse(
    (await redactInaccessibleActivity(scope.userId, [row]))[0]!,
  );
}
export async function publishFeatureContent(
  scope: FeatureScope,
  type: string,
  resourceId: string,
) {
  await publishEvent(type, {
    projectId: scope.projectId,
    featureId: scope.featureId,
    taskId: scope.featureId,
    resourceId,
    userId: scope.userId,
  });
}
