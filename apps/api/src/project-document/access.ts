import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import { projectDocumentTable } from "../database/schema";
import { lockAuthorizedProject } from "../milestone/access-scope";
import type { ProjectDocumentScope } from "./schema";

export type DocumentTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

// Keeps the authorized workspace stable and serializes changes to the
// project's page tree, so sibling positions stay dense.
export async function lockDocumentTree(
  tx: DocumentTransaction,
  scope: ProjectDocumentScope,
) {
  await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`project-document-tree:${scope.projectId}`}, 0))`,
  );
}

export async function findProjectDocument(
  tx: Pick<DocumentTransaction, "select">,
  scope: ProjectDocumentScope,
  id: string,
  lock = false,
) {
  const query = tx
    .select()
    .from(projectDocumentTable)
    .where(
      and(
        eq(projectDocumentTable.id, id),
        eq(projectDocumentTable.projectId, scope.projectId),
      ),
    );
  const [document] = await (lock ? query.for("update") : query);
  if (!document)
    throw new HTTPException(404, { message: "Document not found" });
  return document;
}
