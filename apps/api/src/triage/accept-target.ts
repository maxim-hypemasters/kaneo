import { and, eq } from "drizzle-orm";
import { columnTable } from "../database/schema";
import { initialTaskStatus } from "../task/controllers/initial-task-status";
import type { TaskCreationTransaction } from "../task/controllers/create-task-in-transaction";

// Accepted work goes to To Do, or to the first open column without one.
export async function resolveAcceptTarget(
  tx: TaskCreationTransaction,
  projectId: string,
) {
  const findColumn = (slug: string) =>
    tx.query.columnTable.findFirst({
      where: and(
        eq(columnTable.projectId, projectId),
        eq(columnTable.slug, slug),
      ),
    });
  const todo = await findColumn("to-do");
  if (todo) return { status: todo.slug, columnId: todo.id };
  const status = await initialTaskStatus(tx, projectId);
  return { status, columnId: (await findColumn(status))?.id ?? null };
}
