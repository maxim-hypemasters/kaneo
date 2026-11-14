import { eq, sql } from "drizzle-orm";
import db from "../database";
import { projectDocumentTable } from "../database/schema";
import { retryTransaction } from "../utils/retry-transaction";
import { findProjectDocument, lockDocumentTree } from "./access";
import { publishProjectDocumentEvent } from "./publish-project-document-event";
import type { ProjectDocumentScope } from "./schema";
import { siblingIds, writeSiblingOrder } from "./sibling-order";

// Deleting a page deletes its sub-pages through the parent_id cascade, and
// their uploads through asset.document_id; the storage cleanup trigger then
// removes the objects.
export async function deleteProjectDocument(
  scope: ProjectDocumentScope,
  id: string,
) {
  const deletedCount = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockDocumentTree(tx, scope);
      const document = await findProjectDocument(tx, scope, id, true);
      const subtree = await tx.execute<{ count: string }>(sql`
        WITH RECURSIVE subtree AS (
          SELECT id FROM project_document WHERE id = ${id}
          UNION ALL
          SELECT d.id FROM project_document d JOIN subtree s ON d.parent_id = s.id
        )
        SELECT count(*) AS count FROM subtree
      `);
      await tx
        .delete(projectDocumentTable)
        .where(eq(projectDocumentTable.id, id));
      await writeSiblingOrder(
        tx,
        document.parentId,
        await siblingIds(tx, scope, document.parentId),
      );
      return Number(subtree.rows[0]?.count ?? 1);
    }),
  );
  await publishProjectDocumentEvent(scope, "project.document.deleted", id);
  return { id, deletedCount };
}
