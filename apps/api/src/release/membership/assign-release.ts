import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { releaseTable, taskTable } from "../../database/schema";
import { chunk } from "../../import/writer/chunk";
import { recordReleaseChange } from "./record-release-change";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Task = typeof taskTable.$inferSelect;

// Ids per UPDATE, well below PostgreSQL's bind parameter limit.
export const RELEASE_CHUNK_SIZE = 1000;

// Lock order for every write to a task's release:
//   1. task rows: the one task (withLockedTask), or a feature and then its
//      followers ordered by id, or a set of tasks ordered by id;
//   2. the release row last, FOR KEY SHARE.
// No single order of task rows fits every path: a feature's release change
// locks the feature before its tasks, joining a feature locks the task
// before the feature, and deleting a release, moving its unfinished items,
// reordering or bulk edits lock sets by id. So these can deadlock each
// other. PostgreSQL then aborts one transaction whole; withLockedTask and the
// release paths run it again (retry-transaction.ts), and anywhere else the
// client gets a 409 to try again.
// Editing a release's fields takes FOR NO KEY UPDATE, which KEY SHARE
// doesn't block, but a rename changes a unique key, so its UPDATE takes FOR
// UPDATE and waits for membership writes in flight on that release. It locks
// no task rows, so it can't deadlock with them. Deleting a release never
// locks its row first: that would deadlock with creating a task in a feature
// in it, which holds the feature and then waits on the release. It locks the
// members instead, and retries when a task joined meanwhile (see
// delete-release.ts).

// The release, locked FOR KEY SHARE so it can't be deleted meanwhile, or
// null when it isn't in the project. A release of another project reads as
// missing, so its name stays private.
export async function findLockedRelease(
  tx: Tx,
  releaseId: string,
  projectId: string,
) {
  const [release] = await tx
    .select({ id: releaseTable.id, name: releaseTable.name })
    .from(releaseTable)
    .where(
      and(
        eq(releaseTable.id, releaseId),
        eq(releaseTable.projectId, projectId),
      ),
    )
    .for("key share");
  return release ?? null;
}

export async function lockRelease(
  tx: Tx,
  releaseId: string,
  projectId: string,
) {
  const release = await findLockedRelease(tx, releaseId, projectId);
  if (!release) {
    throw new HTTPException(404, { message: "Release not found" });
  }
  return release;
}

export async function setReleaseOf(
  tx: Tx,
  taskIds: readonly string[],
  releaseId: string | null,
) {
  for (const ids of chunk(taskIds, RELEASE_CHUNK_SIZE)) {
    await tx
      .update(taskTable)
      .set({ releaseId })
      .where(inArray(taskTable.id, ids));
  }
}

export async function setTaskRelease(
  tx: Tx,
  task: Task,
  releaseId: string | null,
  userId?: string,
) {
  if (task.type === "feature")
    throw new HTTPException(400, { message: "Features do not have a release" });
  if (releaseId === task.releaseId) {
    return { task, movedTaskIds: [] as string[] };
  }
  const movedTaskIds: string[] = [];
  if (releaseId) await lockRelease(tx, releaseId, task.projectId);

  const [updated] = await tx
    .update(taskTable)
    .set({ releaseId })
    .where(eq(taskTable.id, task.id))
    .returning();
  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update the release" });
  }
  await setReleaseOf(tx, movedTaskIds, releaseId);
  await recordReleaseChange(tx, {
    taskIds: [task.id, ...movedTaskIds],
    projectId: task.projectId,
    from: task.releaseId,
    to: releaseId,
    userId,
  });
  return { task: updated, movedTaskIds };
}
