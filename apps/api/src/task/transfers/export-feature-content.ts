import { inArray } from "drizzle-orm";
import type db from "../../database";
import {
  activityTable,
  featureDocumentTable,
  userTable,
} from "../../database/schema";
import { transferFeatureUpdateSchema } from "./feature-content-schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Activity = typeof activityTable.$inferSelect;

export async function exportFeatureContent(
  tx: Tx,
  featureIds: readonly string[],
  activities: readonly Activity[],
) {
  const documents = featureIds.length
    ? await tx
        .select()
        .from(featureDocumentTable)
        .where(inArray(featureDocumentTable.featureId, [...featureIds]))
        .orderBy(featureDocumentTable.createdAt, featureDocumentTable.id)
    : [];
  const features = new Set(featureIds);
  const reports = activities.filter(
    (item) => item.type === "feature_update" && features.has(item.taskId),
  );
  const authorIds = [
    ...new Set([
      ...documents.flatMap((item) => [item.createdBy, item.updatedBy]),
      ...reports.map((item) => item.userId),
    ]),
  ].filter((id): id is string => id !== null);
  const authors = new Map(
    authorIds.length
      ? (
          await tx
            .select({
              id: userTable.id,
              name: userTable.name,
              avatar: userTable.image,
            })
            .from(userTable)
            .where(inArray(userTable.id, authorIds))
        ).map((user) => [user.id, user])
      : [],
  );
  return {
    featureDocuments: documents.map((item) => ({
      key: item.id,
      featureKey: item.featureId,
      title: item.title,
      body: item.body,
      revision: item.revision,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      createdBy: {
        name:
          (item.createdBy && authors.get(item.createdBy)?.name) ||
          item.createdByName,
      },
      updatedBy: {
        name:
          (item.updatedBy && authors.get(item.updatedBy)?.name) ||
          item.updatedByName,
      },
    })),
    featureUpdates: reports.flatMap((item) => {
      const data = item.eventData;
      if (
        typeof data !== "object" ||
        data === null ||
        !("milestones" in data) ||
        !Array.isArray(data.milestones) ||
        ("redacted" in data && data.redacted)
      )
        return [];
      const author = item.userId ? authors.get(item.userId) : null;
      const parsed = transferFeatureUpdateSchema.safeParse({
        key: item.id,
        featureKey: item.taskId,
        note: item.content,
        health: "health" in data ? data.health : null,
        milestones: data.milestones.map((snapshot: unknown) => {
          if (typeof snapshot !== "object" || snapshot === null)
            return snapshot;
          const { id, ...fields } = snapshot as Record<string, unknown>;
          return { key: id, ...fields };
        }),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        author: {
          name: author?.name ?? item.externalUserName,
          avatar: author?.avatar ?? item.externalUserAvatar,
        },
      });
      return parsed.success ? [parsed.data] : [];
    }),
  };
}
