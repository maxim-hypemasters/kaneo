import { eq } from "drizzle-orm";
import { documentCommentTable } from "../database/schema";

// The document a request comments on, with the scope its route authorized.
// Feature documents are reached through their Feature.
export type CommentTarget = {
  documentId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
} & (
  | { kind: "page"; featureId?: undefined }
  | { kind: "feature"; featureId: string }
);

export type CommentDocument = Pick<CommentTarget, "kind" | "documentId">;

export function onCommentDocument({ kind, documentId }: CommentDocument) {
  return eq(
    kind === "page"
      ? documentCommentTable.projectDocumentId
      : documentCommentTable.featureDocumentId,
    documentId,
  );
}

export function commentDocumentValues({ kind, documentId }: CommentDocument) {
  return kind === "page"
    ? { projectDocumentId: documentId }
    : { featureDocumentId: documentId };
}
