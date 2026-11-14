import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import type { z } from "../openapi";
import { retryTransaction } from "../utils/retry-transaction";
import {
  type DocumentTransaction,
  findProjectDocument,
  lockDocumentTree,
} from "./access";
import { placeInSiblings } from "./place-in-siblings";
import { publishProjectDocumentEvent } from "./publish-project-document-event";
import type { moveProjectDocumentBody, ProjectDocumentScope } from "./schema";
import { siblingIds, writeSiblingOrder } from "./sibling-order";

async function isSelfOrAncestor(
  tx: DocumentTransaction,
  id: string,
  parentId: string,
) {
  const result = await tx.execute<{ found: number }>(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM project_document WHERE id = ${parentId}
      UNION ALL
      SELECT d.id, d.parent_id FROM project_document d
      JOIN ancestors a ON d.id = a.parent_id
    )
    SELECT 1 AS found FROM ancestors WHERE id = ${id} LIMIT 1
  `);
  return result.rows.length > 0;
}

export async function moveProjectDocument(
  scope: ProjectDocumentScope,
  id: string,
  { parentId, index }: z.infer<typeof moveProjectDocumentBody>,
) {
  const row = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockDocumentTree(tx, scope);
      const document = await findProjectDocument(tx, scope, id, true);
      if (parentId) {
        await findProjectDocument(tx, scope, parentId);
        if (await isSelfOrAncestor(tx, id, parentId))
          throw new HTTPException(400, {
            message: "A page cannot be moved into itself or its sub-pages",
          });
      }
      const order = placeInSiblings(
        await siblingIds(tx, scope, parentId),
        id,
        index,
      );
      await writeSiblingOrder(tx, parentId, order);
      if (document.parentId !== parentId)
        await writeSiblingOrder(
          tx,
          document.parentId,
          await siblingIds(tx, scope, document.parentId),
        );
      return findProjectDocument(tx, scope, id);
    }),
  );
  await publishProjectDocumentEvent(scope, "project.document.moved", id);
  return row;
}
