import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { featureDocumentTable, projectDocumentTable } from "../database/schema";
import { featureOwner } from "../feature/access";
import {
  assertAuthorizedProjectSnapshot,
  lockAuthorizedProject,
} from "../milestone/access-scope";
import type { DocumentTransaction } from "../project-document/access";
import type { CommentTarget } from "./target";

// Checks that the document is still where the route authorized it and returns
// its title. The body is never selected: it can be a megabyte, and comments do
// not need it. A write holds the document against deletion until it commits.
export async function findCommentDocument(
  tx: DocumentTransaction,
  target: CommentTarget,
  lock = false,
): Promise<{ title: string }> {
  return target.kind === "page"
    ? findPage(tx, target, lock)
    : findFeatureDocument(tx, target, lock);
}

async function findPage(
  tx: DocumentTransaction,
  target: CommentTarget,
  lock: boolean,
) {
  if (lock)
    await lockAuthorizedProject(tx, target.projectId, target.workspaceId);
  else
    await assertAuthorizedProjectSnapshot(
      tx,
      target.projectId,
      target.workspaceId,
    );
  const query = tx
    .select({ title: projectDocumentTable.title })
    .from(projectDocumentTable)
    .where(
      and(
        eq(projectDocumentTable.id, target.documentId),
        eq(projectDocumentTable.projectId, target.projectId),
      ),
    );
  const [page] = await (lock ? query.for("key share") : query);
  if (!page) throw new HTTPException(404, { message: "Document not found" });
  return page;
}

async function findFeatureDocument(
  tx: DocumentTransaction,
  target: Extract<CommentTarget, { kind: "feature" }>,
  lock: boolean,
) {
  await featureOwner(tx, target, lock);
  const query = tx
    .select({ title: featureDocumentTable.title })
    .from(featureDocumentTable)
    .where(
      and(
        eq(featureDocumentTable.featureId, target.featureId),
        eq(featureDocumentTable.id, target.documentId),
      ),
    );
  const [document] = await (lock ? query.for("key share") : query);
  if (!document)
    throw new HTTPException(404, { message: "Feature document not found" });
  return document;
}
