import { asc, eq } from "drizzle-orm";
import { columnTable } from "../../database/schema";
import type { TaskCreationTransaction } from "./create-task-in-transaction";

export async function initialTaskStatus(
  tx: TaskCreationTransaction,
  projectId: string,
) {
  const columns = await tx
    .select()
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId))
    .orderBy(asc(columnTable.position), asc(columnTable.id));
  const slugCounts = new Map<string, number>();
  for (const column of columns)
    slugCounts.set(column.slug, (slugCounts.get(column.slug) ?? 0) + 1);
  return (
    columns.find(
      (column) =>
        !column.isFinal &&
        column.slug !== "planned" &&
        column.slug !== "archived" &&
        slugCounts.get(column.slug) === 1,
    )?.slug ?? "planned"
  );
}
