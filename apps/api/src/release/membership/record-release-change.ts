import { eq } from "drizzle-orm";
import createActivities from "../../activity/controllers/create-activities";
import type db from "../../database";
import { releaseTable } from "../../database/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function releaseName(tx: Tx, releaseId: string | null) {
  if (!releaseId) return null;
  const [release] = await tx
    .select({ name: releaseTable.name })
    .from(releaseTable)
    .where(eq(releaseTable.id, releaseId));
  return release?.name ?? null;
}

// Records a "release_changed" activity on each task, naming both releases as
// they are now: call it before deleting one. projectId is the tasks' project
// at that moment, which holds both releases: activity outlives a move, so
// reads hide the names from viewers who can't see that project.
export async function recordReleaseChange(
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
  if (taskIds.length === 0 || from === to) return;
  const eventData = {
    projectId,
    oldReleaseId: from,
    oldReleaseName: await releaseName(tx, from),
    newReleaseId: to,
    newReleaseName: await releaseName(tx, to),
  };
  await createActivities(
    taskIds.map((taskId) => ({
      taskId,
      type: "release_changed",
      userId: userId ?? null,
      content: null,
      eventData,
    })),
    tx,
  );
}
