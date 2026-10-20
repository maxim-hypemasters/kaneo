import type db from "../../database";
import { activityTable } from "../../database/schema";
import { taskTable } from "../../database/schema";
import { eq } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PlanningSnapshot = {
  createdAt?: string;
  status?: string | null;
  columnId?: string | null;
  priority?: string | null;
  userId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  releaseId?: string | null;
  releaseName?: string | null;
  archivedAt?: string | null;
};

export async function preserveImportedPlanning(
  tx: Tx,
  taskId: string,
  userId: string | undefined,
  values: PlanningSnapshot,
  snapshots: readonly PlanningSnapshot[] = [],
  releases: ReadonlyMap<string, string> = new Map(),
) {
  const legacy = Object.values(values).some((value) => value != null);
  const [owner] = await tx
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId));
  for (const snapshot of [...snapshots, ...(legacy ? [values] : [])]) {
    const { createdAt, ...eventData } = snapshot;
    await tx.insert(activityTable).values({
      taskId,
      userId: userId ?? null,
      type: "feature_planning_snapshot",
      content: null,
      eventData: {
        ...eventData,
        projectId: owner?.projectId,
        releaseId: eventData.releaseId
          ? (releases.get(eventData.releaseId) ?? null)
          : null,
      },
      ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
    });
  }
}
