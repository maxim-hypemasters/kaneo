import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { CommentedDocument } from "./types";

// Resolves a thread, or reopens it.
export async function resolveDocumentComment(
  document: CommentedDocument,
  threadId: string,
  resolved: boolean,
) {
  const json = { resolved };
  const response =
    document.kind === "page"
      ? await client["project-document"][":id"].comments[
          ":commentId"
        ].resolution.$put({
          param: { id: document.documentId, commentId: threadId },
          json,
        })
      : await client.feature[":id"].documents[":documentId"].comments[
          ":commentId"
        ].resolution.$put({
          param: {
            id: document.featureId,
            documentId: document.documentId,
            commentId: threadId,
          },
          json,
        });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
