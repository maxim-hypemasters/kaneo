import { eq } from "drizzle-orm";
import type db from "../../database";
import { taskTable } from "../../database/schema";
import createActivities from "../../activity/controllers/create-activities";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function featureTitle(tx: Tx, featureId: string | null) {
  if (!featureId) return null;
  const [feature] = await tx
    .select({ title: taskTable.title })
    .from(taskTable)
    .where(eq(taskTable.id, featureId));
  return feature?.title ?? null;
}

// Records a "feature_changed" activity on each task. projectId is the tasks'
// project at that moment, which holds both features: activity outlives a
// move, so reads hide the titles from viewers who can't see that project.
export async function recordFeatureChange(
  tx: Tx,
  {
    taskIds,
    projectId,
    from,
    to,
    userId,
  }: {
    taskIds: readonly string[];
    projectId: string;
    from: string | null;
    to: string | null;
    userId?: string;
  },
) {
  if (taskIds.length === 0) return;
  const eventData = {
    projectId,
    oldFeatureId: from,
    oldFeatureTitle: await featureTitle(tx, from),
    newFeatureId: to,
    newFeatureTitle: await featureTitle(tx, to),
  };
  await createActivities(
    taskIds.map((taskId) => ({
      taskId,
      type: "feature_changed",
      userId: userId ?? null,
      content: null,
      eventData,
    })),
    tx,
  );
}
