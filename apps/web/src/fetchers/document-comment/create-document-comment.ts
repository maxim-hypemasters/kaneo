import { client } from "@kaneo/libs";
import type { CommentAnchor } from "@/components/editor/comments/comment-anchor";
import { HttpError } from "@/lib/http-error";
import type { CommentedDocument } from "./types";

// Starts a thread on the quoted part of the document.
export async function createDocumentComment(
  document: CommentedDocument,
  json: { content: string; anchor: CommentAnchor },
) {
  const response =
    document.kind === "page"
      ? await client["project-document"][":id"].comments.$post({
          param: { id: document.documentId },
          json,
        })
      : await client.feature[":id"].documents[":documentId"].comments.$post({
          param: { id: document.featureId, documentId: document.documentId },
          json,
        });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
