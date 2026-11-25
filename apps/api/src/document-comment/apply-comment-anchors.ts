import { and, isNull, sql } from "drizzle-orm";
import { documentCommentTable } from "../database/schema";
import type { z } from "../openapi";
import type { DocumentTransaction } from "../project-document/access";
import type { commentAnchorUpdates } from "./anchor-schema";
import { type CommentDocument, onCommentDocument } from "./target";

// Moves the document's threads to where a save left their text, and reports
// whether any anchor changed. Ids of replies, other documents or deleted
// threads match nothing, so they can never fail the save they arrive with.
// Only the anchor is written: the comment itself has not been edited.
export async function applyCommentAnchors(
  tx: Pick<DocumentTransaction, "update">,
  document: CommentDocument,
  anchors: z.infer<typeof commentAnchorUpdates> | undefined,
) {
  if (!anchors?.length) return false;
  const latest = [
    ...new Map(anchors.map((anchor) => [anchor.id, anchor])).values(),
  ];
  // One JSON parameter instead of four per thread.
  const moved = await tx
    .update(documentCommentTable)
    .set({
      anchorQuote: sql`moved.quote`,
      anchorPrefix: sql`moved.prefix`,
      anchorSuffix: sql`moved.suffix`,
    })
    .from(
      sql`jsonb_to_recordset(${JSON.stringify(latest)}::jsonb) as moved(id text, quote text, prefix text, suffix text)`,
    )
    .where(
      and(
        sql`${documentCommentTable.id} = moved.id`,
        onCommentDocument(document),
        isNull(documentCommentTable.parentId),
        sql`(${documentCommentTable.anchorQuote}, ${documentCommentTable.anchorPrefix}, ${documentCommentTable.anchorSuffix}) is distinct from (moved.quote, moved.prefix, moved.suffix)`,
      ),
    )
    .returning({ id: documentCommentTable.id });
  return moved.length > 0;
}
