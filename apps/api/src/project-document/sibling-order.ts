import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { projectDocumentTable } from "../database/schema";
import type { DocumentTransaction } from "./access";
import type { ProjectDocumentScope } from "./schema";

export async function siblingIds(
  tx: DocumentTransaction,
  scope: ProjectDocumentScope,
  parentId: string | null,
) {
  const rows = await tx
    .select({ id: projectDocumentTable.id })
    .from(projectDocumentTable)
    .where(
      and(
        eq(projectDocumentTable.projectId, scope.projectId),
        parentId
          ? eq(projectDocumentTable.parentId, parentId)
          : isNull(projectDocumentTable.parentId),
      ),
    )
    .orderBy(asc(projectDocumentTable.position), asc(projectDocumentTable.id));
  return rows.map((row) => row.id);
}

// Places `ids` under `parentId` at positions 0..n-1 without touching
// updatedAt: reordering a page is not an edit of its content.
export async function writeSiblingOrder(
  tx: DocumentTransaction,
  parentId: string | null,
  ids: string[],
) {
  for (const [position, id] of ids.entries())
    await tx
      .update(projectDocumentTable)
      .set({
        parentId,
        position,
        updatedAt: sql`${projectDocumentTable.updatedAt}`,
      })
      .where(eq(projectDocumentTable.id, id));
}
