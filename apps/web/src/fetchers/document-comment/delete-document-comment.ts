import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { CommentedDocument } from "./types";

// Deleting a thread's first comment deletes its replies with it.
export async function deleteDocumentComment(
  document: CommentedDocument,
  commentId: string,
) {
  const response =
    document.kind === "page"
      ? await client["project-document"][":id"].comments[":commentId"].$delete({
          param: { id: document.documentId, commentId },
        })
      : await client.feature[":id"].documents[":documentId"].comments[
          ":commentId"
        ].$delete({
          param: {
            id: document.featureId,
            documentId: document.documentId,
            commentId,
          },
        });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
