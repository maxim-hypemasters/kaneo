import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { retryTransaction } from "../../utils/retry-transaction";

type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Runs mutate with the task locked FOR UPDATE. A deadlock with a path that
// locks the same rows in another order runs it again, so mutate must only
// write to the database; publish after this returns.
export async function withLockedTask<T>(
  id: string,
  mutate: (
    tx: TaskTransaction,
    before: typeof taskTable.$inferSelect,
  ) => Promise<T>,
  beforeLock?: (tx: TaskTransaction) => Promise<void>,
) {
  return retryTransaction(() =>
    db.transaction(async (tx) => {
      await beforeLock?.(tx);
      const [before] = await tx
        .select()
        .from(taskTable)
        .where(eq(taskTable.id, id))
        .for("update");
      if (!before) throw new HTTPException(404, { message: "Task not found" });
      return { before, after: await mutate(tx, before) };
    }),
  );
}
