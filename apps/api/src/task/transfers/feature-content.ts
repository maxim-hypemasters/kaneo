import { createId } from "@paralleldrive/cuid2";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { activityTable, featureDocumentTable } from "../../database/schema";
import type {
  TransferFeatureDocument,
  TransferFeatureUpdate,
} from "./feature-content-schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FeatureContent = {
  featureDocuments?: readonly TransferFeatureDocument[];
  featureUpdates?: readonly TransferFeatureUpdate[];
};

export function validateFeatureContent(
  content: FeatureContent,
  tasks: readonly { key?: string; type?: string }[],
  milestones: readonly { key: string; featureKey: string }[],
) {
  const features = new Set(
    tasks.filter((task) => task.type === "feature").map((task) => task.key),
  );
  const owners = new Map(milestones.map((item) => [item.key, item.featureKey]));
  for (const rows of [content.featureDocuments, content.featureUpdates]) {
    const keys = new Set<string>();
    for (const item of rows ?? []) {
      if (keys.has(item.key) || !features.has(item.featureKey))
        throw new HTTPException(400, {
          message:
            "Feature content keys must be unique and reference an imported Feature",
        });
      keys.add(item.key);
    }
  }
  for (const update of content.featureUpdates ?? []) {
    const keys = new Set<string>();
    for (const milestone of update.milestones) {
      if (
        keys.has(milestone.key) ||
        (owners.has(milestone.key) &&
          owners.get(milestone.key) !== update.featureKey)
      )
        throw new HTTPException(400, {
          message:
            "Update snapshots must reference distinct milestones of their Feature",
        });
      keys.add(milestone.key);
    }
  }
}

export async function importFeatureContent(
  tx: Tx,
  projectId: string,
  content: FeatureContent,
  taskIds: ReadonlyMap<string, string>,
  milestoneIds: ReadonlyMap<string, string>,
) {
  for (const document of content.featureDocuments ?? []) {
    await tx.insert(featureDocumentTable).values({
      featureId: taskIds.get(document.featureKey)!,
      title: document.title,
      body: document.body,
      revision: document.revision,
      createdByName: document.createdBy.name,
      updatedByName: document.updatedBy.name,
      createdAt: new Date(document.createdAt),
      updatedAt: new Date(document.updatedAt),
    });
  }
  // Deleted milestone snapshots retain a stable historical identity, without
  // accidentally linking to a milestone on the importing installation.
  const historicalIds = new Map<string, string>();
  for (const update of content.featureUpdates ?? []) {
    await tx.insert(activityTable).values({
      taskId: taskIds.get(update.featureKey)!,
      type: "feature_update",
      content: update.note,
      userId: null,
      externalUserName: update.author.name,
      externalUserAvatar: update.author.avatar ?? null,
      externalSource: "kaneo",
      createdAt: new Date(update.createdAt),
      updatedAt: new Date(update.updatedAt),
      eventData: {
        projectId,
        health: update.health,
        milestones: update.milestones.map(({ key, ...snapshot }) => {
          let id = milestoneIds.get(key) ?? historicalIds.get(key);
          if (!id) {
            id = createId();
            historicalIds.set(key, id);
          }
          return { id, ...snapshot };
        }),
      },
    });
  }
}
